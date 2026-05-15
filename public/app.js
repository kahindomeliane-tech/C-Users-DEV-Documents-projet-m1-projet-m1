// Connexion au serveur Socket.IO
const socket = io();

// Récupération du username depuis le localStorage
const username = localStorage.getItem("username");
if (!username) {
    window.location = "login.html";
}

// Référence vers la zone des messages
const messages = document.getElementById("messages");

// Fonction utilitaire pour ajouter un message dans la zone
function addMessage(html, className = "message") {
    const div = document.createElement("div");
    div.classList.add(className);
    div.innerHTML = html;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
}

// --- Gestion des groupes ---
function joinGroup() {
    const group = document.getElementById("group").value;
    socket.emit("joinGroup", { username, group });
}

// --- Envoi de message ---
function sendMessage() {
    const input = document.getElementById("messageInput");
    const message = input.value;
    const group = document.getElementById("group").value;

    if (message.trim() !== "") {
        socket.emit("chat message", { group, message });
        input.value = "";
    }
}

// --- Réception des messages ---
socket.on("chat message", (data) => {
    addMessage(`<strong>${data.user}</strong><br>${data.text}`);
});

socket.on("system", (msg) => {
    addMessage(msg, "system");
});

// --- Upload de fichier ---
async function uploadFile() {
    const file = document.getElementById("fileInput").files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("username", username);

    const response = await fetch("/upload", {
        method: "POST",
        body: formData
    });

    const result = await response.json();

    socket.emit("chat message", {
        user: username,
        text: `📁 ${result.fileName}<br>🏆 Premier partage : ${result.firstUploader}`
    });
}

// --- Ajout d'émojis ---
function addEmoji(emoji) {
    const input = document.getElementById("messageInput");
    input.value += emoji;
    input.focus();
}

// --- Déconnexion ---
function logout() {
    localStorage.removeItem("username");
    window.location = "login.html";
}

// --- Connexion automatique au groupe choisi ---
joinGroup();
