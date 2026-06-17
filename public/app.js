// Connexion au serveur Socket.IO
const socket = io();

// Récupération du username depuis le localStorage
const username = localStorage.getItem("username");
const role = localStorage.getItem("role") || "user";
const isAdmin = role === "admin" || username?.toLowerCase() === "admin";
if (!username) {
    window.location = "login.html";
}

// Référence vers les zones des messages
const messages = document.getElementById("messages");
const adminPanel = document.getElementById("adminPanel");
const adminMessages = document.getElementById("adminMessages");
const adminToggle = document.getElementById("adminToggle");

if (adminToggle) {
    adminToggle.style.display = isAdmin ? "inline-block" : "none";
}

// Fonction utilitaire pour ajouter un message dans la zone
function addMessage(html, className = "message") {
    const div = document.createElement("div");
    div.classList.add(className);
    div.innerHTML = html;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
}

// --- PIN utilisateur ---
let userPin = "";
function setPin() {
    userPin = localStorage.getItem("pin") || prompt("Entrez votre PIN de sécurité :");
    localStorage.setItem("pin", userPin);
}

// --- Clé de chiffrement/déchiffrement (utilisateur) ---
function setDecryptKey() {
    const key = prompt("Entrez votre clé de chiffrement/déchiffrement :");
    if (key) {
        sessionStorage.setItem('decryptKey', key);
        alert('Clé enregistrée pour la session.');
    }
}

function getStoredKey() {
    return sessionStorage.getItem('decryptKey') || userPin;
}

// --- Gestion des groupes ---
function joinGroup() {
    const group = document.getElementById("group").value;
    socket.emit("joinGroup", { username, group });
}

// --- Génération de clé AES à partir du PIN ---
async function getKeyFromPin(pin) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        enc.encode(pin),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );

    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: enc.encode("chat-salt"),
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-CBC", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

// --- Chiffrement ---
async function encryptMessage(message, pin) {
    const key = await getKeyFromPin(pin);
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const enc = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-CBC", iv },
        key,
        enc.encode(message)
    );
    return {
        encrypted: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
        iv: btoa(String.fromCharCode(...iv))
    };
}

// --- Déchiffrement ---
async function decryptMessage(encryptedBase64, ivBase64, pin) {
    try {
        const key = await getKeyFromPin(pin);
        const encryptedBytes = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
        const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));
        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-CBC", iv },
            key,
            encryptedBytes
        );
        return new TextDecoder().decode(decrypted);
    } catch {
        return "Erreur de déchiffrement";
    }
}

// --- Envoi de message ---
async function sendMessage() {
    const input = document.getElementById("messageInput");
    const message = input.value;
    const group = document.getElementById("group").value;

    if (message.trim() !== "") {
        const key = getStoredKey();
        if (!key) {
            alert('Veuillez définir une clé avec le bouton "Clé" avant d\'envoyer.');
            return;
        }
        const { encrypted, iv } = await encryptMessage(message, key);
        socket.emit("chat message", { group, encrypted, iv, plain: message });
        input.value = "";
    }
}

// --- Réception des messages ---
socket.on("chat message", async (data) => {
    // Ne pas déchiffrer automatiquement : afficher la version chiffrée
    const id = 'msg-' + Math.random().toString(36).slice(2,9);
    const html = `
        <div id="${id}">
            <strong>${data.user}</strong><br>
            <div class="encrypted">${data.encrypted}</div>
            <button onclick="attemptDecrypt('${id}', '${data.encrypted}', '${data.iv}')">Déchiffrer</button>
        </div>`;
    addMessage(html);
});

async function attemptDecrypt(containerId, encryptedBase64, ivBase64) {
    const key = getStoredKey() || prompt('Entrez la clé pour déchiffrer ce message :');
    if (!key) return;
    const decrypted = await decryptMessage(encryptedBase64, ivBase64, key);
    const container = document.getElementById(containerId);
    if (!container) return;
    if (decrypted === 'Erreur de déchiffrement') {
        container.innerHTML = `<strong>Message</strong><br><em>Erreur de déchiffrement (clé incorrecte)</em><br><small>${encryptedBase64}</small>`;
    } else {
        container.innerHTML = `<strong>Message</strong><br>${decrypted}`;
    }
}

socket.on("system", (msg) => {
    addMessage(msg, "system");
});

socket.on("admin history", (history) => {
    if (!isAdmin) return;
    history.forEach(item => addAdminMessage(item));
});

socket.on("admin message", (item) => {
    if (!isAdmin) return;
    addAdminMessage(item);
});

socket.on("admin system", (msg) => {
    if (!isAdmin) return;
    const div = document.createElement("div");
    div.classList.add("admin-message", "admin-system");
    div.innerHTML = msg;
    adminMessages.appendChild(div);
    adminMessages.scrollTop = adminMessages.scrollHeight;
});

function addAdminMessage(item) {
    const div = document.createElement("div");
    div.classList.add("admin-message");
    div.innerHTML = `
        <p><strong>${item.user}</strong> — <em>${item.group}</em> <small>${new Date(item.timestamp).toLocaleTimeString()}</small></p>
        <p>${item.plain}</p>
        <p class="admin-system">Chiffré: ${item.encrypted}</p>
    `;
    adminMessages.appendChild(div);
    adminMessages.scrollTop = adminMessages.scrollHeight;
}

function showAdminPanel() {
    if (!isAdmin) return;
    adminPanel.style.display = "block";
}

function hideAdminPanel() {
    adminPanel.style.display = "none";
}

// --- Upload de fichier ---
async function uploadFile() {
    const file = document.getElementById("fileInput").files[0];
    const group = document.getElementById("group").value;

    if (!file) {
        alert("Veuillez sélectionner un fichier.");
        return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("username", username);

    try {
        const response = await fetch("/upload", {
            method: "POST",
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            const firstNote = result.firstUploader === username
                ? '🏆 Premier partage !'
                : `🔁 Premier partagé par : ${result.firstUploader}`;

            const { encrypted, iv } = await encryptMessage(
                `📁 Fichier partagé : ${result.fileName}<br>${firstNote}`,
                userPin
            );

            socket.emit("chat message", { group, encrypted, iv });
        } else {
            alert("Erreur lors de l'envoi du fichier.");
        }
    } catch (err) {
        console.error("Erreur upload:", err);
        alert("Impossible d'envoyer le fichier.");
    }
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
    localStorage.removeItem("pin");
    window.location = "login.html";
}

// --- Connexion automatique au groupe choisi ---
// Demander le PIN d'abord pour s'assurer que le chiffrement/déchiffrement fonctionne
setPin();
if (isAdmin) {
    const pwd = prompt('Mot de passe administrateur :');
    socket.emit("joinAdmin", { username, password: pwd });
} else {
    joinGroup();
}

socket.on('admin denied', (msg) => {
    alert(msg || 'Accès admin refusé');
    if (adminToggle) adminToggle.style.display = 'none';
});
