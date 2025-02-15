function loadRegister(){
	console.log("Loading register.")

	checkAuth().then(isAuthenticated => {
        console.log("Is user auth? " + isAuthenticated)
		if(isAuthenticated == true){
            window.location.href = "#game";
            console.log("Already logged-in -> redirecting to game page.")
        	return;
		}
	});

}

function initRegister(){
	console.log("Initializing register.")
	
	document.getElementById('register_42log').addEventListener('click', async function(event) {
		checkAuth().then(isAuthenticated => {
            console.log("Is user auth? " + isAuthenticated)
            if(isAuthenticated == true){
                console.log("Already logged-in")
                return;
            }
            window.location.href = "/api/users/oauth_login/";
        });
    });
    document.getElementById('register_submit').addEventListener('click', async function(event) {
		async function checkUserAuth() {
			const isAuthenticated = await checkAuth();
			console.log("Is user auth? " + isAuthenticated);
		
			if (isAuthenticated) {
				console.log("Already logged-in");
				return;
			}
			const username = document.getElementById('register_username').value.trim();
			const email = document.getElementById('register_email').value;
			const password = document.getElementById('register_password').value;
			const confirm_password = document.getElementById('register_confirm_password').value;
			
			if (password !== confirm_password) {
				showError('Passwords do not match.');
				return;
			}
	
			try {
				console.log('Fetching CSRF token...');
				const csrfResponse = await fetch('/api/users/csrf/', {
					method: 'GET',
					credentials: 'include',
					headers: {
						'Accept': 'application/json',
						'X-Requested-With': 'XMLHttpRequest'
					}
				});
	
				if (!csrfResponse.ok) {
					const errorText = await csrfResponse.text();
					console.error('CSRF Error:', csrfResponse.status, errorText);
					throw new Error('Failed to get CSRF token');
				}
	
				const csrfData = await csrfResponse.json();
				const csrfToken = csrfData.csrfToken;
				console.log('Got CSRF token');
	
				console.log('Attempting registration...');
				const registerResponse = await fetch('/api/users/register/', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-CSRFToken': csrfToken,
						'Accept': 'application/json',
						'X-Requested-With': 'XMLHttpRequest'
					},
					credentials: 'include',
					body: JSON.stringify({ username, email, password })
				});
	
				if (!registerResponse.ok) {
					const errorText = await registerResponse.text();
					throw new Error(errorText);
				}
	
				const responseData = await registerResponse.json();
				console.log('Registration successful');
	
				const loginResponse = await attemptLogin(username, password, csrfToken);
				if (loginResponse)
					handleRedirect('#game');
			} catch (error) {
				showError(error.message);
			}
		}
		checkUserAuth()
	});
	document.addEventListener("keydown", function(event) {
		if ((event.code === "Enter" || event.code === "NumpadEnter") && getPage() == "register") {
			event.preventDefault();
			document.getElementById("register_submit").click();
		}
	});
	
}