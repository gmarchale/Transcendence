function loadLogin(){
    console.log("Loading login.")
    checkAuth().then(isAuthenticated => {
        console.log("Is user auth? " + isAuthenticated)
		if(isAuthenticated == true){
            if(location.hash.slice(1) == "login" || location.hash.slice(1) == "register"){
                window.location.href = "#game";
                console.log("Already logged-in -> redirecting to game page.")
            }
        	return;
		}
	});
}

function initLogin(){
    console.log("Initializing login.")
    
    document.getElementById('login_42log').addEventListener('click', async function(event) {
		checkAuth().then(isAuthenticated => {
            console.log("Is user auth? " + isAuthenticated)
            if(isAuthenticated == true){
                console.log("Already logged-in")
                return;
            }
            window.location.href = "/api/users/oauth_login/";
        });
    });
    document.getElementById('login_submit').addEventListener('click', async function(event) {
        async function checkUserAuth() {
            const isAuthenticated = await checkAuth();
            console.log("Is user auth? " + isAuthenticated);
        
            if (isAuthenticated) {
                console.log("Already logged-in");
                return;
            }
            var username = document.getElementById("login_username");
            if(username != null)
                username = username.value;
            var password = document.getElementById('login_password');
            if(password != null)
                password = password.value;
    
            if (!username || !password) {
                showError('Please enter both username and password');
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
                    throw new Error('Failed to get CSRF token');
                }
                
                const csrfData = await csrfResponse.json();
                const csrfToken = csrfData.csrfToken;
                console.log('Got CSRF token');
                const loginResponse = await attemptLogin(username, password, csrfToken);
                if (loginResponse)
                    handleRedirect('#game');
            } catch (error) {
                showError(error.message);
            }
        }
        
        checkUserAuth();
    });
    document.addEventListener("keydown", function(event) {
        if ((event.code === "Enter" || event.code === "NumpadEnter") && getPage() == "login") {
            event.preventDefault();
            document.getElementById("login_submit").click();
        }
    }); 
};

async function olog() {
    return await fetch('/api/users/oauth_login/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken,
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include',
        body: JSON.stringify({ username, password })
    });
}