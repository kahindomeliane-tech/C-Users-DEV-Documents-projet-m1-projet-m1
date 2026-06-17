// --- Dépendances ---
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

// Rediriger la racine vers la page de connexion pour forcer l'authentification
app.get("/", (req, res) => {
    res.redirect("/login.html");
});
app.get("/index.html", (req, res) => {
    res.redirect("/login.html");
});

// Servir les fichiers statiques (HTML, CSS, JS)
app.use(express.static("public"));

const upload = multer({ dest: "uploads/" });

const DEFAULT_ADMIN = { username: "admin", password: "admin123", isAdmin: true };
let users = [DEFAULT_ADMIN];
let filesDB = {};
let adminSockets = new Set();
let allMessages = [];

// --- Authentification ---
app.post("/register", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.json({ success: false, message: "Nom et mot de passe requis" });
    }
    if (username.toLowerCase() === "admin") {
        return res.json({ success: false, message: "Nom réservé, choisissez un autre nom" });
    }
    const exist = users.find(u => u.username === username);
    if (exist) {
        return res.json({ success: false, message: "Utilisateur existe déjà" });
    }
    const passwordTaken = users.find(u => u.password === password);
    if (passwordTaken) {
        return res.json({ success: false, message: "Ce mot de passe est déjà utilisé. Choisissez un mot de passe unique." });
    }
    users.push({ username, password });
    res.json({ success: true });
});

app.post("/login", (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) {
        return res.json({ success: false, message: "Identifiants incorrects" });
    }
    const role = user.isAdmin ? "admin" : "user";
    res.json({ success: true, username, role });
});

// --- Upload ---
app.post("/upload", upload.single("file"), (req, res) => {
    const file = req.file;
    const fakeHash = file.originalname + "_" + file.size;
    if (!filesDB[fakeHash]) {
        filesDB[fakeHash] = { firstUploader: req.body.username };
    }
    res.json({
        success: true,
        fileName: file.originalname,
        firstUploader: filesDB[fakeHash].firstUploader
    });
});

// --- Chat avec 5 groupes ---
io.on("connection", (socket) => {
    socket.on("joinGroup", ({ username, group }) => {
        socket.username = username;
        socket.group = group;
        socket.join(group);
        const systemMessage = `${username} a rejoint ${group}`;
        io.to(group).emit("system", systemMessage);
        adminSockets.forEach(adminSocket => adminSocket.emit("admin system", systemMessage));
    });

    socket.on("joinAdmin", ({ username, role } = {}) => {
        if (!username || username.toLowerCase() !== 'admin' || role !== 'admin') {
            socket.emit('admin denied', 'Accès administrateur refusé');
            return;
        }

        socket.username = 'admin';
        socket.isAdmin = true;
        adminSockets.add(socket);
        socket.join('admin');
        socket.emit("admin history", allMessages);
        socket.emit('admin ok', 'Accès admin autorisé');
    });

    // Admin actions
    socket.on('admin delete user', (targetUsername) => {
        if (!socket.isAdmin) return socket.emit('admin denied', 'Action non autorisée');
        if (!targetUsername) return;
        // remove from users DB
        users = users.filter(u => u.username !== targetUsername && u.username !== undefined);

        // disconnect any sockets with that username
        for (const [id, s] of io.of('/').sockets) {
            try {
                if (s.username && s.username === targetUsername) {
                    s.emit('system', `Vous avez été supprimé par l'administrateur.`);
                    s.disconnect(true);
                }
            } catch (err) { /* ignore */ }
        }

        const sys = `Administrateur a supprimé l'utilisateur ${targetUsername}`;
        io.emit('system', sys);
        adminSockets.forEach(as => as.emit('admin system', sys));
    });

    // ⚠️ Le serveur ne chiffre pas, il relaie simplement
    socket.on("chat message", ({ group, encrypted, iv, plain }) => {
        const chatPayload = {
            user: socket.username || "Invité",
            group,
            encrypted,
            iv,
            plain: plain || "(message non disponible)",
            timestamp: new Date().toISOString()
        };

        allMessages.push(chatPayload);
        io.to(group).emit("chat message", { user: socket.username, encrypted, iv });
        adminSockets.forEach(adminSocket => adminSocket.emit("admin message", chatPayload));
    });

    socket.on("disconnect", () => {
        if (socket.isAdmin) {
            adminSockets.delete(socket);
        }

        if (socket.username && socket.group) {
            const message = `${socket.username} a quitté ${socket.group}`;
            io.to(socket.group).emit("system", message);
            adminSockets.forEach(adminSocket => adminSocket.emit("admin system", message));
        }
    });
});

// Écoute du serveur avec tentative sur un port alternatif si 3000 est occupé
const DEFAULT_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
function listenWithRetry(startPort, maxAttempts = 5) {
    let port = startPort;
    let attempts = 0;

    function tryListen() {
        server.listen(port, () => {
            console.log(`Serveur lancé sur http://localhost:${port}`);
        });

        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE' && attempts < maxAttempts) {
                console.warn(`Port ${port} occupé, tentative sur ${port + 1}...`);
                attempts++;
                port++;
                server.removeAllListeners('error');
                tryListen();
            } else {
                console.error('Erreur serveur:', err);
                process.exit(1);
            }
        });
    }

    tryListen();
}

listenWithRetry(DEFAULT_PORT);
