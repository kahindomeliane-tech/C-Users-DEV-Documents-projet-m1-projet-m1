// --- Dépendances ---
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static("public"));

// --- Variables sensibles (⚠️ à mettre dans Render → Environment Variables)
const JWT_SECRET = process.env.JWT_SECRET || "fallbackSecret";
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://Meliane:Meliane@cluster0.ypyn4v4.mongodb.net/PROJETM1?retryWrites=true&w=majority";

// --- Connexion MongoDB Atlas ---
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connecté"))
  .catch(err => console.error("❌ Erreur MongoDB:", err));

// --- Schémas Mongoose ---
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
  isAdmin: { type: Boolean, default: false }
});

// Hachage du mot de passe avant sauvegarde (version moderne)
userSchema.pre("save", async function() {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});
const User = mongoose.model("User", userSchema);

const fileSchema = new mongoose.Schema({
  fileName: String,
  firstUploader: String,
  size: Number,
  createdAt: { type: Date, default: Date.now }
});
const File = mongoose.model("File", fileSchema);

const messageSchema = new mongoose.Schema({
  senderId: String,
  recipientId: String,
  encryptedContent: String,
  iv: String,
  authTag: String,
  timestamp: { type: Date, default: Date.now },
  status: { type: String, enum: ["sent", "received", "read"], default: "sent" }
});
const Message = mongoose.model("Message", messageSchema);

// --- Middleware JWT ---
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Token manquant" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Token invalide" });
    req.user = user;
    next();
  });
}

// --- Routes ---
app.get("/", (req, res) => res.redirect("/login.html"));

// Upload (protégé par JWT)
const upload = multer({ dest: "uploads/" });
app.post("/upload", authenticateToken, upload.single("file"), async (req, res) => {
  const file = req.file;
  let existing = await File.findOne({ fileName: file.originalname, size: file.size });
  if (!existing) {
    existing = new File({ fileName: file.originalname, size: file.size, firstUploader: req.user.username });
    await existing.save();
  }
  res.json({ success: true, fileName: file.originalname, firstUploader: existing.firstUploader });
});

// Register
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.json({ success: false, message: "Nom et mot de passe requis" });
  }

  const exist = await User.findOne({ username });
  if (exist) {
    return res.json({ success: false, message: "Utilisateur existe déjà" });
  }

  const user = new User({ username, password });
  await user.save();

  res.json({ success: true });
});

// Login avec JWT
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.json({ success: false, message: "Utilisateur introuvable" });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.json({ success: false, message: "Mot de passe incorrect" });

  const token = jwt.sign(
    { id: user._id, username: user.username, role: user.isAdmin ? "admin" : "user" },
    JWT_SECRET,
    { expiresIn: "24h" }
  );

  res.json({ success: true, token, role: user.isAdmin ? "admin" : "user" });
});

// --- Chat avec Socket.IO ---
io.on("connection", (socket) => {
  console.log("🔗 Un utilisateur est connecté");

  socket.on("chat message", async (msg) => {
    io.emit("chat message", msg);
    const newMsg = new Message({
      senderId: socket.username || "Invité",
      recipientId: "global",
      encryptedContent: msg,
      timestamp: new Date()
    });
    await newMsg.save();
  });

  socket.on("disconnect", () => {
    console.log("❌ Utilisateur déconnecté");
  });
});

// --- Définition du port ---
const PORT = process.env.PORT || 3000;

// --- Serveur ---
server.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur http://localhost:${PORT}`);
});
