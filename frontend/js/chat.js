function loadChat(){
	console.log("Loading chat.")
	currentlyWith = 0;
	usernameWith = null;
	let chatContainer = document.getElementById("chat_main_container");
	let isClosed = !chatContainer.classList.contains("expanded");
	if (!isClosed){
		chatContainer.classList.toggle("expanded");
		document.getElementById("chat_title").textContent = "Chat";
	}
	closeChat()

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
		const hash = location.hash.split('?')[0].slice(1) || 'game';
		if ((event.code === "Enter" || event.code === "NumpadEnter") && currentlyWith != 0 && hash != "login" && hash != "register") {
            sendMessage();
        }
    });
}

let usernameWith = null;
let currentlyWith = 0;
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
	// if (!chatSocket || chatSocket.readyState !== WebSocket.OPEN) {
    //     console.error("WebSocket non connecté, message non envoyé.");
    //     return;
    // }

	const userId = currentlyWith;

	let inputField = document.getElementById("chat_input");
	let message = inputField.value.trim();
	if (message === "") return;

	appendMessage("You", message, true);
	inputField.value = "";

	// chatSocket.send(JSON.stringify({
    //     "id_user_1": userId,
    //     "message": message
    // }));
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
			<div class="chat_only_message"><span class="chat_text">${message}</span></div>`;
	else 
		messageDiv.innerHTML = `
			<div class="chat_only_message"><span class="chat_text">${message}</span></div>
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

function updateChatLanguage(){
	if(currentlyWith != 0){
		document.getElementById("chat_title").textContent = "Chat - " + usernameWith;
		document.getElementById("chat_send_message").textContent = getTranslation("chat_send_message");
		document.getElementById("back_to_friends").textContent = getTranslation("chat_back_to_friends");
		document.getElementById("chat_input").placeholder = getTranslation("chat_input");
	} else {
		let chatContainer = document.getElementById("chat_main_container");
		let isClosed = !chatContainer.classList.contains("expanded");
		if (!isClosed) document.getElementById("chat_title").textContent = "Chat - " + getTranslation("chat_friendlist_title");
		else document.getElementById("chat_title").textContent = "Chat";
	}
}

function openChat(username, friendId) {
	const userId = friendId;
	fetchMessages(userId)

	let friendsList = document.getElementById("chat_friends_list");
	let chatBox = document.getElementById("chat_container");
	let settings = document.getElementById("chat_settings");

	friendsList.style.display = "none"; 
	chatBox.style.display = "block";
	settings.style.display = "block";
	currentlyWith = friendId;
	usernameWith = username;
	updateChatLanguage()
	document.getElementById("chat_messages").innerHTML = "<p>Loading messages with " + username + "...</p>";
}

function initChat(){
	console.log("Initializing chat.")
	// initWebSocket()

	const chatContainer = document.getElementById("chat_main_container");
	const chatToggle = document.getElementById("chat_header");
	const backToFriends = document.getElementById("back_to_friends");
	const settings = document.getElementById("chat_settings");
	const menu = document.getElementById('chat_dropdownMenu');

	chatToggle.addEventListener("click", function(event) {
		let clickedElement = event.target;
		if (!clickedElement.closest("#chat_settings") && !clickedElement.closest("#chat_dropdownMenu")) {
			let isClosed = !chatContainer.classList.contains("expanded");
			if (isClosed){
				loadChat()
				document.getElementById("chat_title").textContent = "Chat - " + getTranslation("chat_friendlist_title");
			} else {
				document.getElementById("chat_title").textContent = "Chat";
				settings.style.display = "none";
				currentlyWith = 0;
			}
			chatContainer.classList.toggle("expanded");
		}
	});
	

	backToFriends.addEventListener("click", function () {
		closeChat()
	});

	document.getElementById('chat_settings').addEventListener('click', function() {
        if(menu.style.display == 'block' && !menu.matches(':hover'))
            closeMenu(menu);
        else openMenu(menu);
    });

	document.getElementById('chat_dropdownMenuButton_Profile').addEventListener('click', function() {
        if(currentlyWith != null){
			window.location.href = "#profile?id=" + currentlyWith;
			closeMenu(menu);
		}
    });

	document.addEventListener('click', function(event) {
        const menu = document.getElementById('chat_dropdownMenu');
        const elements = document.querySelectorAll("#chat_dropdownMenuButton");

        elements.forEach(element => {
            if(element.matches(':hover'))
                closeMenu(menu);
        });
        if(document.getElementById("chat_block").matches(':hover'))
            closeMenu(menu);

        if ((!settings.matches(':hover') && !menu.matches(':hover')))
            closeMenu(menu);
    });

	document.getElementById('chat_block').addEventListener('click', async () => {
		let cmd = "block_user";

        try {
			console.log("Managing block status with "+ currentlyWith);

            const response = await fetch('/api/chat/'+ cmd +'/', {
                method: 'POST',
				headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
				body: JSON.stringify({ id_user_0: getCookie("id"), id_user_1: currentlyWith })
            });
			document.getElementById("chat_block").textContent = getTranslation("profile_block_manage_block")
        } catch (error) {
            console.error('Error logging out:', error);
        }
    });

}

function closeChat(){
	let friendsList = document.getElementById("chat_friends_list");
	let chatBox = document.getElementById("chat_container");
	let settings = document.getElementById("chat_settings");

	chatBox.style.display = "none";
	settings.style.display = "none";
	friendsList.style.display = "block";
	currentlyWith = 0;
	usernameWith = null;
	let chatContainer = document.getElementById("chat_main_container");
	let isClosed = !chatContainer.classList.contains("expanded");
	if (!isClosed)
		document.getElementById("chat_title").textContent = "Chat - " + getTranslation("chat_friendlist_title");
}

function closeMenu(menu){
    menu.style.display = 'none';
}

function openMenu(menu){
    menu.style.display = 'block';
}