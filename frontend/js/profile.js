async function loadProfile(){
	console.log("Loading profile.")

	document.getElementById("profile_container").classList.add("active");
	if(getHashParam("id") != null){
		try {
			const response = await fetch('/api/chat/test/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
				body: JSON.stringify({ id_user_0: getHashParam("id"), id_user_1: getHashParam("id") })
			});
			const data = await response.json();
			if(data.username != null){
				document.getElementById("profile_username").textContent = data.username;
				document.getElementById("profile_not_found_container").classList.remove("active");
			} else {
				document.getElementById("profile_container").classList.remove("active");
				document.getElementById("profile_not_found_container").classList.add("active");
				document.getElementById("profile_username").textContent = getTranslation("profile_user_not_found");
			}
		} catch (error) {
			console.error('Error :', error);
		}
	} else {
		document.getElementById("profile_not_found_container").classList.remove("active");
		document.getElementById("profile_username").textContent = getCookie("username");
	}
	loadFriendship()
	loadBlocked()
}

function initProfile(){
	console.log("Initializing profile.")

	document.getElementById('profile_friend_manage').addEventListener('click', async () => {
		let cmd = "add_friend_user";
		if(document.getElementById("profile_friend_manage").textContent == getTranslation("profile_friend_manage_pending")
		|| document.getElementById("profile_friend_manage").textContent == getTranslation("profile_friend_manage_remove"))
			cmd = "delete_friend_user";

        try {
			let userId = getHashParam("id");
			if(userId == null)
				userId = getCookie("id")
			console.log("Managing friendship with "+ userId);

            const response = await fetch('/api/chat/'+ cmd +'/', {
                method: 'POST',
				headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
				body: JSON.stringify({ id_user_0: getCookie("id"), id_user_1: userId })
            });
			const data = await response.json();
			loadFriendship()
        } catch (error) {
            console.error('Error logging out:', error);
        }
    });

	document.getElementById('profile_block_manage').addEventListener('click', async () => {
		let cmd = "block_user";
		if(document.getElementById("profile_block_manage").textContent == getTranslation("profile_block_manage_unblock"))
			cmd = "delete_blocked_user";

        try {
			let userId = getHashParam("id");
			if(userId == null)
				userId = getCookie("id")
			console.log("Managing block status with "+ userId);

            const response = await fetch('/api/chat/'+ cmd +'/', {
                method: 'POST',
				headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
				body: JSON.stringify({ id_user_0: getCookie("id"), id_user_1: userId })
            });
			const data = await response.json();
			if(data.message.includes("removed"))
				document.getElementById("profile_block_manage").textContent = getTranslation("profile_block_manage_block")
			else if(data.message.includes("has been blocked"))
				document.getElementById("profile_block_manage").textContent = getTranslation("profile_block_manage_unblock")
        } catch (error) {
            console.error('Error logging out:', error);
        }
    });
}

async function isBlocked(userId) {
	try {
		const response = await fetch('/api/chat/get_blocked/', {
			method: 'GET',
			headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') }
		});

		if (!response.ok)
			throw new Error('Erreur lors de la récupération des utilisateurs bloqués');

		const data = await response.json();
		const blockedUsers = data.blocked;

		const isBlocked = blockedUsers.some(user => user.id == userId);
		return isBlocked;
	} catch (error) {
		console.error("Erreur :", error);
	}
	return false;
}

async function loadBlocked(){
	if(await isBlocked(getHashParam("id"))){
		document.getElementById("profile_block_manage").textContent = getTranslation("profile_block_manage_unblock")
	} else {
		document.getElementById("profile_block_manage").textContent = getTranslation("profile_block_manage_block")
	}
}

async function loadFriendship(){
	try {
		await getid();
		let userId = getHashParam("id");
		if(userId == null)
			userId = getCookie("id")
		console.log("Checking friendship with id "+ userId);

		const response = await fetch('/api/chat/check_friendship/', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
			body: JSON.stringify({ id_user_0: getCookie("id"), id_user_1: userId })
		});
		const data = await response.json();
		
		if(data.is_friends == "false" || await isBlocked(getHashParam("id"))) document.getElementById("profile_friend_manage").textContent = getTranslation("profile_friend_manage_add")
		else if(data.is_friends == "true") document.getElementById("profile_friend_manage").textContent = getTranslation("profile_friend_manage_remove")
		else if(data.is_friends == "pending") document.getElementById("profile_friend_manage").textContent = getTranslation("profile_friend_manage_pending")
		else if(data.is_friends == "waiting") document.getElementById("profile_friend_manage").textContent = getTranslation("profile_friend_manage_accept")
    } catch (error) {
        console.error('Error checking auth:', error);
    }
}
