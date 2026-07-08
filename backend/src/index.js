require("dotenv").config();
const Groq = require("groq-sdk");
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const { GoogleGenerativeAI } = require("@google/generative-ai");

let groq = null;

if (process.env.GROQ_API_KEY) {
  groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
  });
}

// Inisialisasi Gemini AI
let genAI = null;

if (process.env.GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

const app = express();
console.log("🔥 SERVER FILE: src/index.js AKTIF");
const port = 3000;

/* ======================
   MIDDLEWARE
====================== */
app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));


/* ======================
   MYSQL CONNECTION
====================== */
const pool = mysql.createPool({
  host: "localhost",
  port: 3306,
  user: "root",
  password: "",
  database: "sampahpedia",
});

const query = async (sql, params = []) => {
  const [rows] = await pool.promise().query(sql, params);
  return rows;
};

pool.promise().getConnection()
  .then(() => console.log("✅ Connected to MySQL"))
  .catch(err => console.error("❌ MySQL error:", err));

/* ======================
   JWT
====================== */
const JWT_SECRET = "sampahpedia_secret_key";

/* ======================
   AUTH MIDDLEWARE
====================== */
const verifyToken = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth) {
    return res.status(401).json({ message: "Token required" });
  }

  const token = auth.split(" ")[1];

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Invalid token" });
    }

    req.user = {
      userId: decoded.userId ?? decoded.id,
      role: decoded.role
    };

    if (!req.user.userId) {
      return res.status(401).json({ message: "Token invalid (userId missing)" });
    }

    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin only" });
  }
  next();
};

/* ======================
   HEALTH CHECK
====================== */
app.get("/health", (req, res) => {
  res.send("Server is running");
});

/* ======================
   AUTH
====================== */

// REGISTER
app.post("/api/register", async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const exist = await query("SELECT id FROM users WHERE email = ?", [email]);
    if (exist.length) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const hashed = await bcrypt.hash(password, 10);

    await query(
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'user')",
      [name, email, hashed]
    );

    res.status(201).json({ message: "Register success" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// LOGIN
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const users = await query("SELECT * FROM users WHERE email = ?", [email]);
    if (!users.length) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const user = users[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        userId: user.id,   // ⬅️ WAJIB
        role: user.role    // ⬅️ WAJIB
      },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ME
app.get("/api/me", verifyToken, async (req, res) => {
  const rows = await query(
    "SELECT id, name, email, role FROM users WHERE id = ?",
    [req.user.userId]
  );
  res.json(rows[0]);
});

/* ======================
   MODULES
====================== */

// GET ALL MODULES (USER)
app.get("/api/modules", verifyToken, async (req, res) => {
  const modules = await query("SELECT * FROM modules ORDER BY id ASC");
  res.json(modules);
});

// CREATE MODULE (ADMIN)
app.post("/api/modules", verifyToken, requireAdmin, async (req, res) => {
  const { title, description, file } = req.body;
  const result = await query(
    "INSERT INTO modules (title, description, file) VALUES (?, ?, ?)",
    [title, description, file]
  );
  res.status(201).json({ moduleId: result.insertId });
});

/* ======================
   QUIZ
====================== */

// GET QUIZ PER MODULE
app.get("/api/modules/:id/quiz", verifyToken, async (req, res) => {
  const moduleId = req.params.id;

  const quiz = await query(
    "SELECT id, title FROM quizzes WHERE module_id = ?",
    [moduleId]
  );
  if (!quiz.length) {
    return res.status(404).json({ message: "Quiz not found" });
  }

  const questions = await query(
    "SELECT id, question FROM quiz_questions WHERE quiz_id = ? ORDER BY sort_order",
    [quiz[0].id]
  );

  for (const q of questions) {
    const options = await query(
      "SELECT id, option_text FROM quiz_options WHERE question_id = ? ORDER BY sort_order",
      [q.id]
    );
    q.options = options;
  }

  res.json({
    quizId: quiz[0].id,
    title: quiz[0].title,
    questions,
  });
});

/* ======================
   QUIZ - SUBMIT
====================== */
app.post("/api/modules/:id/quiz/submit", verifyToken, async (req, res) => {
  try {
    const moduleId = Number(req.params.id);
    const userId = req.user.userId; // ✅ FIX
    const { answers } = req.body;

    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ message: "Jawaban tidak boleh kosong" });
    }

    let score = 0;

    for (const a of answers) {
      const rows = await query(
        "SELECT is_correct FROM quiz_options WHERE id=? AND question_id=?",
        [a.optionId, a.questionId]
      );
      if (rows.length && rows[0].is_correct === 1) score++;
    }

    const totalRows = await query(
      `SELECT COUNT(*) total
       FROM quiz_questions qq
       JOIN quizzes q ON q.id=qq.quiz_id
       WHERE q.module_id=?`,
      [moduleId]
    );

    const total = totalRows[0].total;
    const status = score === total ? "done" : "in_progress";

    await query(
      `INSERT INTO user_module_progress (user_id, module_id, status, score)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status=?, score=?`,
      [userId, moduleId, status, score, status, score]
    );

    console.log("USER DARI TOKEN:", req.user)

    res.json({ score, total, status });
  } catch (err) {
    console.error("SUBMIT QUIZ ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ======================
   PROGRESS - USER
====================== */
app.get("/api/progress/me", verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // total modul
    const totalModulesRow = await query(
      "SELECT COUNT(*) AS total FROM modules"
    );
    const totalModules = totalModulesRow[0].total;

    // modul yang selesai
    const doneRow = await query(
      `SELECT COUNT(*) AS done 
       FROM user_module_progress 
       WHERE user_id = ? AND status = 'done'`,
      [userId]
    );
    const doneModules = doneRow[0].done;

    // detail progress (opsional)
    const details = await query(
      `SELECT 
         m.id,
         m.title,
         COALESCE(ump.status, 'locked') AS status
       FROM modules m
       LEFT JOIN user_module_progress ump
         ON m.id = ump.module_id AND ump.user_id = ?
       ORDER BY m.id ASC`,
      [userId]
    );

    res.json({
      done: doneModules,
      total: totalModules,
      progressText: `${doneModules}/${totalModules}`,
      modules: details
    });

  } catch (err) {
    console.error("GET PROGRESS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =========================
   ADMIN - MODULES (CRUD)
========================= */

// list modul (admin)
app.get("/api/admin/modules", verifyToken, requireAdmin, async (req, res) => {
  try {
    const rows = await query("SELECT * FROM modules ORDER BY id ASC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// create modul (admin)
app.post("/api/admin/modules", verifyToken, requireAdmin, async (req, res) => {
  const { title, description, file } = req.body;
  try {
    const result = await query(
      "INSERT INTO modules (title, description, file) VALUES (?, ?, ?)",
      [title, description || null, file || null]
    );
    res.status(201).json({ message: "Module created", moduleId: result.insertId });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// update modul (admin)
app.put("/api/admin/modules/:id", verifyToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { title, description, file } = req.body;
  try {
    const result = await query(
      "UPDATE modules SET title=?, description=?, file=? WHERE id=?",
      [title, description || null, file || null, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: "Module not found" });
    res.json({ message: "Module updated" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// delete modul (admin)
app.delete("/api/admin/modules/:id", verifyToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await query("DELETE FROM modules WHERE id=?", [id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: "Module not found" });
    res.json({ message: "Module deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});


/* =========================
   ADMIN - QUIZ (CRUD)
========================= */

// ambil quiz by module (admin)
app.get("/api/admin/modules/:moduleId/quiz", verifyToken, requireAdmin, async (req, res) => {
  const { moduleId } = req.params;

  try {
    const quizRows = await query("SELECT id, title FROM quizzes WHERE module_id=?", [moduleId]);
    if (!quizRows.length) return res.json(null);

    const quizId = quizRows[0].id;

    const qRows = await query(
      "SELECT id, question, sort_order FROM quiz_questions WHERE quiz_id=? ORDER BY sort_order ASC",
      [quizId]
    );

    const questions = [];
    for (const q of qRows) {
      const opts = await query(
        "SELECT id, option_text, is_correct, sort_order FROM quiz_options WHERE question_id=? ORDER BY sort_order ASC",
        [q.id]
      );
      questions.push({
        id: q.id,
        question: q.question,
        sort_order: q.sort_order,
        options: opts.map(o => ({
          id: o.id,
          text: o.option_text,
          is_correct: o.is_correct === 1,
          sort_order: o.sort_order
        }))
      });
    }

    res.json({
      quizId,
      moduleId: Number(moduleId),
      title: quizRows[0].title,
      questions
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// create/replace quiz by module (admin)
app.post("/api/admin/modules/:moduleId/quiz", verifyToken, requireAdmin, async (req, res) => {
  const { moduleId } = req.params;
  const { title, questions } = req.body;

  if (!title || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ message: "Invalid payload" });
  }

  // validasi: tiap soal minimal 2 opsi, harus ada 1 benar
  for (const q of questions) {
    if (!q.question || !Array.isArray(q.options) || q.options.length < 2) {
      return res.status(400).json({ message: "Each question must have options" });
    }
    const correctCount = q.options.filter(o => o.is_correct).length;
    if (correctCount !== 1) {
      return res.status(400).json({ message: "Each question must have exactly 1 correct option" });
    }
  }

  const conn = await pool.promise().getConnection();
  try {
    await conn.beginTransaction();

    // kalau sudah ada quiz → hapus
    const existing = await conn.query("SELECT id FROM quizzes WHERE module_id=?", [moduleId]);
    const existingRows = existing[0];
    if (existingRows.length) {
      await conn.query("DELETE FROM quizzes WHERE module_id=?", [moduleId]);
    }

    // create quiz
    const [quizInsert] = await conn.query(
      "INSERT INTO quizzes (module_id, title) VALUES (?, ?)",
      [moduleId, title]
    );
    const quizId = quizInsert.insertId;

    // insert questions + options
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const [qIns] = await conn.query(
        "INSERT INTO quiz_questions (quiz_id, question, sort_order) VALUES (?, ?, ?)",
        [quizId, q.question, i + 1]
      );
      const questionId = qIns.insertId;

      for (let j = 0; j < q.options.length; j++) {
        const opt = q.options[j];
        await conn.query(
          "INSERT INTO quiz_options (question_id, option_text, is_correct, sort_order) VALUES (?, ?, ?, ?)",
          [questionId, opt.text, opt.is_correct ? 1 : 0, j + 1]
        );
      }
    }

    await conn.commit();
    res.status(201).json({ message: "Quiz saved", quizId });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: "Server error", error: err.message });
  } finally {
    conn.release();
  }
});

// delete quiz by module (admin)
app.delete("/api/admin/modules/:moduleId/quiz", verifyToken, requireAdmin, async (req, res) => {
  const { moduleId } = req.params;
  try {
    const result = await query("DELETE FROM quizzes WHERE module_id=?", [moduleId]);
    if (result.affectedRows === 0) return res.status(404).json({ message: "Quiz not found" });
    res.json({ message: "Quiz deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/* =========================
   USER - MODULES (READ)
========================= */
app.get("/api/modules", verifyToken, async (req, res) => {
  try {
    const rows = await query(
      "SELECT id, title, description, file FROM modules ORDER BY id ASC"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/* =========================
   USER - QUIZ
========================= */
app.get("/api/modules/:moduleId/quiz", verifyToken, async (req, res) => {
  const { moduleId } = req.params;

  try {
    const quizRows = await query(
      "SELECT id, title FROM quizzes WHERE module_id=?",
      [moduleId]
    );
    if (!quizRows.length) return res.status(404).json({ message: "Quiz not found" });

    const quizId = quizRows[0].id;

    const qRows = await query(
      "SELECT id, question FROM quiz_questions WHERE quiz_id=? ORDER BY sort_order ASC",
      [quizId]
    );

    const questions = [];
    for (const q of qRows) {
      const opts = await query(
        "SELECT id, option_text FROM quiz_options WHERE question_id=? ORDER BY sort_order ASC",
        [q.id]
      );
      questions.push({
        id: q.id,
        question: q.question,
        options: opts
      });
    }

    res.json({
      quizId,
      title: quizRows[0].title,
      questions
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ======================
// COMMUNITY REQUEST
// ======================
  app.post("/api/community/requests", verifyToken, async (req, res) => {
  // 🔐 HANYA USER BOLEH REQUEST
  if (req.user.role !== "user") {
    return res.status(403).json({
      message: "Hanya user yang boleh mengajukan komunitas"
    });
  }

  const { community_name, description, city, contact } = req.body;

  if (!community_name) {
    return res.status(400).json({
      message: "Nama komunitas wajib diisi"
    });
  }

  const existing = await query(
    "SELECT id FROM community_requests WHERE user_id=? AND status='pending'",
    [req.user.userId]
  );

  if (existing.length > 0) {
    return res.status(400).json({
      message: "Request kamu masih pending"
    });
  }

  await query(
    `INSERT INTO community_requests
     (user_id, community_name, description, city, contact)
     VALUES (?, ?, ?, ?, ?)`,
    [req.user.userId, community_name, description || null, city || null, contact || null]
  );

  res.status(201).json({
    message: "Request komunitas berhasil dikirim (pending)"
  });
});

// ======================
// ADMIN - COMMUNITY REQUESTS
// ======================

// list semua request komunitas
app.get(
  "/api/admin/community/requests",
  verifyToken,
  requireAdmin,
  async (req, res) => {
    try {
      const rows = await query(`
        SELECT 
          cr.id,
          u.name AS pengaju,
          u.email,
          cr.community_name,
          cr.city,
          cr.status
        FROM community_requests cr
        JOIN users u ON u.id = cr.user_id
        ORDER BY cr.created_at DESC
      `);

      res.json(rows);
    } catch (err) {
      console.error("GET /api/admin/community/requests:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);


app.put(
  "/api/admin/community/requests/:id/approve",
  verifyToken,
  requireAdmin,
  async (req, res) => {
    const { id } = req.params;
    const conn = await pool.promise().getConnection();

    try {
      await conn.beginTransaction();

      // ambil request
      const [rows] = await conn.query(
        "SELECT * FROM community_requests WHERE id=? AND status='pending'",
        [id]
      );

      if (!rows.length) {
        await conn.rollback();
        return res.status(404).json({
          message: "Request tidak ditemukan atau sudah diproses"
        });
      }

      const reqData = rows[0];

      // ubah role user jadi community
      await conn.query(
        "UPDATE users SET role='community' WHERE id=?",
        [reqData.user_id]
      );

      // buat data komunitas
      await conn.query(
        `INSERT INTO communities (owner_user_id, name, city)
         VALUES (?, ?, ?)`,
        [reqData.user_id, reqData.community_name, reqData.city]
      );

      // update status request
      await conn.query(
        "UPDATE community_requests SET status='approved' WHERE id=?",
        [id]
      );

      await conn.commit();
      res.json({ message: "Request disetujui" });
    } catch (err) {
      await conn.rollback();
      console.error("APPROVE COMMUNITY ERROR:", err);
      res.status(500).json({ message: "Server error" });
    } finally {
      conn.release();
    }
  }
);

app.put(
  "/api/admin/community/requests/:id/reject",
  verifyToken,
  requireAdmin,
  async (req, res) => {
    const { id } = req.params;

    try {
      const result = await query(
        "UPDATE community_requests SET status='rejected' WHERE id=? AND status='pending'",
        [id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          message: "Request tidak ditemukan atau sudah diproses"
        });
      }

      res.json({ message: "Request ditolak" });
    } catch (err) {
      console.error("REJECT COMMUNITY ERROR:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/* ======================
   ADMIN - REVOKE COMMUNITY
====================== */
app.put(
  "/api/admin/community/:userId/revoke",
  verifyToken,
  requireAdmin,
  async (req, res) => {
    const { userId } = req.params;
    const conn = await pool.promise().getConnection();

    try {
      await conn.beginTransaction();

      // pastikan user memang community
      const [users] = await conn.query(
        "SELECT id, role FROM users WHERE id=?",
        [userId]
      );

      if (!users.length || users[0].role !== "community") {
        await conn.rollback();
        return res.status(400).json({
          message: "User bukan community"
        });
      }

      // hapus data community
      await conn.query(
        "DELETE FROM communities WHERE owner_user_id=?",
        [userId]
      );

      // ubah role balik ke user
      await conn.query(
        "UPDATE users SET role='user' WHERE id=?",
        [userId]
      );

      await conn.commit();
      res.json({
        message: "Akun community dikembalikan menjadi user"
      });

    } catch (err) {
      await conn.rollback();
      console.error("REVOKE COMMUNITY ERROR:", err);
      res.status(500).json({
        message: "Server error",
        error: err.message
      });
    } finally {
      conn.release();
    }
  }
);


// ======================
// COMMUNITY PROFILE
// ======================

// Ambil profil komunitas milik user yang login (untuk community role)
app.get("/api/community/me", verifyToken, async (req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM communities WHERE owner_user_id=?",
      [req.user.userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "Community profile belum ada." });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error("GET /api/community/me:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});


// ======================
// COMMUNITY EVENTS (Jadwal Kegiatan)
// ======================

// List semua event (PUBLIC)
app.get("/api/community/events", async (req, res) => {
  try {
    const rows = await query(
      `SELECT 
         e.*,
         c.\`NAME\` AS community_name
       FROM community_events e
       JOIN communities c ON c.id = e.community_id
       ORDER BY e.event_date ASC, e.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /api/community/events:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Create event (community/admin)
app.post("/api/community/events", verifyToken, async (req, res) => {
  const { title, event_date, location, description, image_url, whatsapp_url } = req.body;

  if (!title || !event_date || !location || !description) {
    return res.status(400).json({
      message: "title, event_date, location, description wajib diisi."
    });
  }

  try {
    // hanya community/admin boleh tambah event
    if (req.user.role !== "community" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Akses ditolak." });
    }

    // ambil community milik user
    const comm = await query(
      "SELECT id FROM communities WHERE owner_user_id=?",
      [req.user.userId]
    );
    if (comm.length === 0) {
      return res.status(400).json({ message: "Profil komunitas belum ada." });
    }

    await query(
    `INSERT INTO community_events
    (community_id, title, event_date, location, description, image_url, whatsapp_url)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      comm[0].id,
      title,
      event_date,
      location,
      description,
      image_url || null,
      whatsapp_url || null
    ]
  );

    res.status(201).json({ message: "Jadwal kegiatan berhasil ditambahkan." });
  } catch (err) {
    console.error("POST /api/community/events:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

app.put("/api/admin/community/requests/:id/approve", verifyToken, requireAdmin, async (req, res) => {
  const { id } = req.params;

  const conn = await pool.promise().getConnection();
  try {
    await conn.beginTransaction();

    const [reqRows] = await conn.query(
      "SELECT * FROM community_requests WHERE id=? AND status='pending'",
      [id]
    );
    if (!reqRows.length) {
      await conn.rollback();
      return res.status(404).json({ message: "Request tidak ditemukan / sudah diproses" });
    }

    const reqData = reqRows[0];

    // ubah role user
    await conn.query(
      "UPDATE users SET role='community' WHERE id=?",
      [reqData.user_id]
    );

    // buat community
    await conn.query(
      `INSERT INTO communities (owner_user_id, name, city)
       VALUES (?, ?, ?)`,
      [reqData.user_id, reqData.community_name, reqData.city]
    );

    // update status request
    await conn.query(
      "UPDATE community_requests SET status='approved' WHERE id=?",
      [id]
    );

    await conn.commit();
    res.json({ message: "Request disetujui" });
  } catch (err) {
    await conn.rollback();
    console.error("APPROVE request:", err);
    res.status(500).json({ message: "Server error" });
  } finally {
    conn.release();
  }
});

app.put("/api/admin/community/requests/:id/reject", verifyToken, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    await query(
      "UPDATE community_requests SET status='rejected' WHERE id=?",
      [id]
    );
    res.json({ message: "Request ditolak" });
  } catch (err) {
    console.error("REJECT request:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ================= UPDATE EVENT =================
app.put("/api/community/events/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  const { title, event_date, location, description, image_url, whatsapp_url } = req.body;

  console.log("=== PUT EVENT MASUK ===");
  console.log("EVENT ID:", id);
  console.log("USER:", req.user);
  console.log("BODY:", req.body);

  try {
    // role check
    if (req.user.role !== "community" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Akses ditolak." });
    }

    // ambil event + owner komunitas
    const rows = await query(
      `SELECT e.*, c.owner_user_id
       FROM community_events e
       JOIN communities c ON c.id = e.community_id
       WHERE e.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Event tidak ditemukan." });
    }

    const event = rows[0];

    // cek kepemilikan
    if (req.user.role !== "admin" && event.owner_user_id !== req.user.userId) {
      return res.status(403).json({ message: "Tidak boleh edit event komunitas lain." });
    }

    // update event
    await query(
      `UPDATE community_events
       SET title = ?, event_date = ?, location = ?, \`DESCRIPTION\` = ?, image_url = ?, whatsapp_url = ?
       WHERE id = ?`,
      [
        title ?? event.title,
        event_date ?? event.event_date,
        location ?? event.location,
        description ?? event.DESCRIPTION,
        image_url ?? event.image_url,
        whatsapp_url ?? event.whatsapp_url,
        id
      ]
    );

    res.json({ message: "Event berhasil diupdate." });
  } catch (err) {
    console.error("PUT EVENT ERROR:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});


// ================= DELETE EVENT =================
app.delete("/api/community/events/:id", verifyToken, async (req, res) => {
  const { id } = req.params;

  console.log("=== DELETE EVENT MASUK ===");
  console.log("EVENT ID:", id);
  console.log("USER:", req.user);

  try {
    if (req.user.role !== "community" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Akses ditolak." });
    }

    const rows = await query(
      `SELECT e.*, c.owner_user_id
       FROM community_events e
       JOIN communities c ON c.id = e.community_id
       WHERE e.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Event tidak ditemukan." });
    }

    const event = rows[0];

    if (req.user.role !== "admin" && event.owner_user_id !== req.user.userId) {
      return res.status(403).json({ message: "Tidak boleh hapus event komunitas lain." });
    }

    await query("DELETE FROM community_events WHERE id = ?", [id]);

    res.json({ message: "Event berhasil dihapus." });
  } catch (err) {
    console.error("DELETE EVENT ERROR:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ================= FORUM =================
app.get("/api/forum", async (req, res) => {
  const rows = await query(`
    SELECT f.id, f.content, f.created_at, u.name
    FROM forum_posts f
    JOIN users u ON u.id = f.user_id
    ORDER BY f.created_at ASC
  `);
  res.json(rows);
});

app.post("/api/forum", verifyToken, async (req, res) => {
  console.log("=== POST /api/forum MASUK ===");
  console.log("BODY:", req.body);
  console.log("USER:", req.user);

  const { content } = req.body;

  if (!content) {
    return res.status(400).json({ message: "Konten kosong" });
  }

  try {
    const result = await query(
      "INSERT INTO forum_posts (user_id, content) VALUES (?, ?)",
      [req.user.userId, content]
    );

    console.log("INSERT RESULT:", result);

    res.json({ message: "Komentar berhasil dikirim" });
  } catch (err) {
    console.error("🔥 MYSQL ERROR:", err);  
    res.status(500).json({
      message: "Gagal kirim komentar",
      sqlError: err.message
    });
  }
});

/* ======================
   MULTER (UPLOAD GAMBAR)
====================== */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

app.post("/api/scan-sampah", upload.single("image"), async (req, res) => {
  try {
    if (!genAI) {
      return res.status(503).json({ success: false, message: "Gemini AI belum dikonfigurasi" });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "Gambar wajib diunggah" });
    }

    // Amankan pengambilan teks pertanyaan agar tidak memicu undefined error
    const userQuestion = req.body.question ? String(req.body.question).trim() : "";

    const fs = require("fs");
    const fileToGenerativePart = (file) => {
      return {
        inlineData: {
          data: Buffer.from(fs.readFileSync(file.path)).toString("base64"),
          mimeType: file.mimetype
        },
      };
    };

    const imagePart = fileToGenerativePart(req.file);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    let prompt = "";
    if (userQuestion !== "") {
      prompt = `
        Analisis gambar sampah yang dilampirkan dan jawab pertanyaan pengguna berikut: "${userQuestion}"
        
        Aturan format jawaban:
        - Jawab dalam Bahasa Indonesia yang ramah.
        - Gunakan format HTML langsung (tag <ul>, <li>, atau <p> jika perlu).
        - JANGAN PERNAH membungkus dengan tanda backtick markdown seperti \`\`\`html.
        - Jawaban singkat, padat, dan sangat relevan dengan pengelolaan sampah/lingkungan.
      `;
    } else {
      prompt = `
        Analisis gambar sampah ini dan berikan informasi berikut dalam Bahasa Indonesia:
        1. Apa nama benda/sampah ini?
        2. Apa kategori jenis sampahnya? (Organik, Anorganik, atau B3)
        3. Bagaimana cara membuang atau mendaur ulangnya dengan benar?
        
        Aturan format jawaban:
        - Gunakan format HTML langsung (gunakan tag <ul> dan <li> untuk daftar).
        - JANGAN PERNAH membungkus dengan tanda backtick markdown seperti \`\`\`html.
        - Maksimal 4 poin singkat.
      `;
    }

    const result = await model.generateContent([prompt, imagePart]);
    let responseText = result.response.text();

    // Hapus file fisik sementara dari folder uploads
    try {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    } catch (fsError) {
      console.error("⚠️ Gagal menghapus file sementara:", fsError.message);
    }

    responseText = responseText.replace(/```html/g, "").replace(/```/g, "").trim();

    // SIMPAN KE DATABASE DENGAN TRY-CATCH AMAN
    try {
      const activeSession = req.body.sessionId ? String(req.body.sessionId) : "default-session";
      const userText = userQuestion !== "" ? userQuestion : "[User mengirim foto sampah untuk dianalisis]";

      await query(
        "INSERT INTO chat_histories (session_id, role, content) VALUES (?, 'user', ?)", 
        [activeSession, userText]
      );
      await query(
        "INSERT INTO chat_histories (session_id, role, content) VALUES (?, 'model', ?)", 
        [activeSession, String(responseText)]
      );
      
      console.log("✅ Berhasil merekam riwayat scan ke database untuk sesi:", activeSession);
    } catch (dbError) {
      // Jika database gagal, cetak error di log VS Code tetapi JANGAN gagalkan kiriman response ke user
      console.error("⚠️ DATABASE ERROR SAAT SCAN GAMBAR:", dbError.message);
    }

    return res.json({
      success: true,
      answer: responseText
    });

  } catch (error) {
    console.error("🔥 GEMINI MULTIMODAL SCAN ERROR:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Gagal memproses analisis gambar di server. Periksa ukuran file gambar Anda." 
    });
  }
});

/* ======================
   BERITA KEGIATAN
====================== */

// GET semua berita
app.get("/api/news", async (req, res) => {
  try {
    const rows = await query("SELECT * FROM news ORDER BY id DESC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST tambah berita
app.post("/api/news", upload.single("image"), async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: "Gambar wajib diupload" });
    }

    await query(
      "INSERT INTO news (title, description, image) VALUES (?, ?, ?)",
      [title, description, req.file.filename]
    );

    res.json({ message: "Berita berhasil ditambahkan" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT edit berita
app.put("/api/news/:id", upload.single("image"), async (req, res) => {
  try {
    const { title, description } = req.body;
    const { id } = req.params;

    if (req.file) {
      await query(
        "UPDATE news SET title=?, description=?, image=? WHERE id=?",
        [title, description, req.file.filename, id]
      );
    } else {
      await query(
        "UPDATE news SET title=?, description=? WHERE id=?",
        [title, description, id]
      );
    }

    res.json({ message: "Berita berhasil diupdate" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE berita
app.delete("/api/news/:id", async (req, res) => {
  try {
    await query("DELETE FROM news WHERE id=?", [req.params.id]);
    res.json({ message: "Berita berhasil dihapus" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// TEST
app.get("/api/test", (req, res) => {
  res.json({
    ok: true,
    gemini: "aktif"
  });
});


app.get("/gemini-test", async (req, res) => {
  try {
    if (!genAI) {
      return res.status(503).json({
        success: false,
        message: "Gemini AI belum dikonfigurasi di file .env"
      });
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash"
    });

    const result = await model.generateContent("Apa itu sampah organik?");
    res.send(result.response.text());

  } catch (error) {
    console.error("GEMINI ERROR:", error);
    res.status(500).send("Gagal mengambil data dari Gemini AI");
  }
});

app.post("/api/ask-ai", async (req, res) => {
  try {
    if (!groq) {
      return res.status(503).json({ success: false, message: "AI belum dikonfigurasi." });
    }

    const { question, sessionId } = req.body;
    const activeSession = sessionId ? String(sessionId) : "default-session";

    if (!question || question.trim() === "") {
      return res.status(400).json({ success: false, message: "Pertanyaan tidak boleh kosong" });
    }

    // 1. Ambil riwayat chat sebelumnya dari database
    let historyRows = [];
    try {
      historyRows = await query(
        "SELECT role, content FROM chat_histories WHERE session_id = ? ORDER BY created_at ASC LIMIT 20",
        [activeSession]
      );
    } catch (dbError) {
      console.error("⚠️ Gagal membaca tabel chat_histories:", dbError.message);
    }

    // 2. Susun instruksi dasar untuk AI (Groq) agar peka terhadap konteks gambar dari database
    const messages = [
      {
        role: "system",
        content: `
Kamu adalah AI Asisten SampahPedia yang cerdas dan ramah.
Tugas utama kamu adalah membantu menjawab pertanyaan seputar pengelolaan sampah, daur ulang, dan lingkungan.

ATURAN UTAMA PERCAKAPAN (WAJIB DIIKUTI):
- Jawab dalam Bahasa Indonesia yang rapi. Gunakan format HTML langsung (seperti <ul> dan <li> jika berupa daftar). JANGAN PERNAH gunakan tanda bintang (*) atau membungkus jawaban dengan \`\`\`html.
- BACA RIWAYAT OBROLAN DENGAN TELITI. Jika pada riwayat obrolan sebelumnya pengguna mengirim foto sampah dan asisten (model) sudah menganalisis isinya (misalnya menyebutkan ada kaleng aluminium, botol plastik, sampah anorganik, dll), maka ketika pengguna bertanya "Cara mengolahnya?", "Bagaimana mengolah masing-masing?", atau pertanyaan lanjutan lainnya, kamu HARUS MENJAWAB SPESIFIK tentang cara mengolah jenis-jenis sampah yang ada di dalam hasil analisis foto terakhir tersebut.
- Jangan pernah mengatakan "Saya tidak bisa melihat foto" atau "Silakan kirim foto", karena detail isi fotonya sudah dituliskan secara teks oleh asisten di riwayat chat sebelumnya. Cukup gunakan data teks analisis tersebut untuk menjawab pertanyaan pengguna saat ini.
`
      }
    ];

    // 3. Masukkan riwayat obrolan dari database ke memori Groq
    if (historyRows && historyRows.length > 0) {
      historyRows.forEach(row => {
        messages.push({
          role: row.role === 'model' ? 'assistant' : 'user',
          content: row.content
        });
      });
    }

    // 4. Masukkan pertanyaan baru dari pengguna
    messages.push({ role: "user", content: question });

    // 5. Panggil Groq API
    const chatCompletion = await groq.chat.completions.create({
      messages: messages,
      model: "llama-3.3-70b-versatile",
      temperature: 0.3, // Diturunkan agar AI lebih patuh pada perintah sistem dan riwayat
      max_tokens: 600
    });

    const answer = chatCompletion.choices[0].message.content;

    // 6. Simpan obrolan baru ini ke database agar memori berlanjut
    try {
      await query("INSERT INTO chat_histories (session_id, role, content) VALUES (?, 'user', ?)", [activeSession, question]);
      await query("INSERT INTO chat_histories (session_id, role, content) VALUES (?, 'model', ?)", [activeSession, answer]);
    } catch (insertError) {
      console.error("⚠️ Gagal menyimpan ke database:", insertError.message);
    }

    return res.json({
      success: true,
      answer: answer
    });

  } catch (error) {
    console.error("🔥 GROQ CHAT GLOBAL ERROR:", error);
    return res.status(500).json({ success: false, message: "Gagal memproses obrolan di server" });
  }
});

/* ======================
   BANK SAMPAH
====================== */

// Ambil semua lokasi bank sampah
app.get("/api/bank-sampah", async (req, res) => {
  try {
    const rows = await query(`
      SELECT
        id,
        nama,
        alamat,
        latitude,
        longitude,
        no_telp,
        jam_operasional
      FROM bank_sampah
      ORDER BY nama ASC
    `);

    res.json(rows);

  } catch (err) {
    console.error("GET BANK SAMPAH ERROR:", err);

    res.status(500).json({
      message: "Server error",
      error: err.message
    });
  }
});

// STATIC
app.use(express.static(path.join(__dirname, "../../frontend")));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// LISTEN
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});