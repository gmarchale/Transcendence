function loadChat(){
	console.log("Loading chat.")
	return;
	fetch("/api/chat/get_friends/", { method: "GET", credentials: "include" })
	.then(response => response.json())
	.then(data => {
		if (data.mutual_friends) {
			let friendsUl = document.getElementById("chat_friends_ul");
			friendsUl.innerHTML = "";

			data.mutual_friends.forEach(friend => {
				let li = document.createElement("li");
				li.textContent = friend.username;
				li.classList.add("friend-item");
				li.dataset.friendId = friend.id;
				friendsUl.appendChild(li);

				li.addEventListener("click", function () {
					openChat(friend.username, friend.id);
				});
			});
		} else {
			console.warn("T'a pas d'amis !!!"); // TODO
		}
	})
	.catch(error => console.error("Error while getting friend list :", error));

	
    let inputField = document.getElementById("chat_input");
    let sendButton = document.getElementById("chat_send_message");

    sendButton.addEventListener("click", sendMessage);

    inputField.addEventListener("keypress", function (event) {
        if (event.key === "Enter") {
            sendMessage();
        }
    });
}

let chatSocket = null;
let reconnectTimeout = null;
const WS_URL = "";

function initWebSocket() {
    // if (chatSocket && chatSocket.readyState === WebSocket.OPEN) return;
	chatSocket = new WebSocket(WS_URL);
    chatSocket.onopen = function () {
        console.log("WebSocket connecté");
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
        }
    };

    chatSocket.onmessage = function (event) {
        const data = JSON.parse(event.data);
        if (data.message && data.sender) {
            appendMessage(data.sender, data.message);
        } else {
            console.warn("Message invalide reçu :", data);
        }
    };

    chatSocket.onerror = function (error) {
        console.error("WebSocket erreur :", error);
    };

    chatSocket.onclose = function () {
        console.warn("WebSocket déconnecté, tentative de reconnexion...");
        reconnectTimeout = setTimeout(initWebSocket, 3000);
    };
}

async function sendMessage() {
	if (!chatSocket || chatSocket.readyState !== WebSocket.OPEN) {
        console.error("WebSocket non connecté, message non envoyé.");
        return;
    }

	const userId = getHashParam("id");

	let inputField = document.getElementById("chat_input");
	let message = inputField.value.trim();
	if (message === "") return;

	appendMessage("You", message, true);
	inputField.value = "";

	chatSocket.send(JSON.stringify({
        "id_user_1": userId,
        "message": message
    }));
	await fetch('/api/chat/send_message/', {
		method: 'POST',
		headers: {'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken')},
		body: JSON.stringify({ id_user_0: getCookie("id"), id_user_1: userId, message: message })
	});
}

function appendMessage(sender, message, isUser) {
	let messagesContainer = document.getElementById("chat_messages");
	let messageDiv = document.createElement("div");
	messageDiv.classList.add("chat_message");
	messageDiv.classList.add(isUser ? "chat_user_message" : "chat_friend_message");
	let avatarUrl = "/images/logo.jpg";
	if(!isUser)
		messageDiv.innerHTML = `
			<img src="${avatarUrl}" alt="Avatar de ${sender}" class="chat_avatar">
			<span class="chat_text">${message}</span>`;
	else 
		messageDiv.innerHTML = `
			<span class="chat_text">${message}</span>
			<img src="${avatarUrl}" alt="Avatar de ${sender}" class="chat_avatar">`;
	messagesContainer.appendChild(messageDiv);
	messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function fetchMessages(friendId) {
	if (!friendId) return;

	const response = await fetch(`/api/chat/get_message/?id_user_1=${friendId}`);
	const data = await response.json();
	
	document.getElementById("chat_messages").innerHTML = "";
	data.messages.forEach(msg => {
		let isUser = msg.sender === getCookie("username") ? true : false;
		appendMessage(msg.sender, msg.text, isUser);
	});
}

function openChat(username, friendId) {
	const userId = friendId;
	fetchMessages(userId)

	let friendsList = document.getElementById("chat_friends_list");
	let chatBox = document.getElementById("chat_container");

	friendsList.style.display = "none"; 
	chatBox.style.display = "block"; 
	document.getElementById("chat_username").textContent = username; 

	document.getElementById("chat_messages").innerHTML = "<p>Loading messages with " + username + "...</p>";
	// setInterval(() => {
	// 	fetchMessages(friendId);
	// }, 200);
}

function initChat(){
	console.log("Initializing chat.")
	return;
	initWebSocket()

	let chatContainer = document.getElementById("chat_main_container");
	let chatToggle = document.getElementById("chat_toggle");

	let friendsList = document.getElementById("chat_friends_list");
	let chatBox = document.getElementById("chat_container");
	let backToFriends = document.getElementById("back_to_friends");

	chatToggle.addEventListener("click", function () {
		chatContainer.classList.toggle("expanded");
	});

	backToFriends.addEventListener("click", function () {
		chatBox.style.display = "none";
		friendsList.style.display = "block";
	});

}