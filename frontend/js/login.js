function loadLogin(){
    console.log("Loading login.")

    if(getHashParam("oauth") == "failed"){
        showError("42oauth error -> \""+getHashParam("error")+"\"");
        return;
    }

    checkAuth(1).then(isAuthenticated => {
        console.log("Is user auth? " + isAuthenticated)
		if(isAuthenticated == true){
            if(getHashParam("oauth") == "true"){
                console.log("Checking Oauth log.")
                console.log(getHashParam("username"));
                console.log(getHashParam("avatar"));
                console.log(getHashParam("id"));
                setCookie("username", getHashParam("username"));
                setCookie("avatar", getHashParam("avatar"));
                setCookie("id", getHashParam("id"));
                window.location.href = "#game";
                console.log("Already logged-in using 42 -> redirecting to game page.")
            }
            if(location.hash.slice(1) == "login"){
                window.location.href = "#game";
                console.log("Already logged-in -> redirecting to game page.")
            }
        	return;
		}
	});

    let lang = localStorage.getItem("language") || "en";
    document.getElementById("login_language_fr").classList.toggle("active", lang === "fr");
    document.getElementById("login_language_en").classList.toggle("active", lang === "en");
    document.getElementById("login_language_sp").classList.toggle("active", lang === "sp");
}

async function initLogin(){
    console.log("Initializing login.")

    let selectedLanguage = localStorage.getItem("language") || "en";
    fetch("languages/lang.json", { cache: "no-cache" })
        .then(response => response.json())
        .then(translations => {
            updateLanguage(selectedLanguage, translations);

            document.getElementById("login_language_fr").addEventListener("click", function () {
                updateLanguage("fr", translations);
            });

            document.getElementById("login_language_en").addEventListener("click", function () {
                updateLanguage("en", translations);
            });

            document.getElementById("login_language_sp").addEventListener("click", function () {
                updateLanguage("sp", translations);
            });
        });

    function updateLanguage(lang, translations) {
        localStorage.setItem("language", lang);

		Object.keys(translations[lang]).forEach(id => {
            let element = document.getElementById(id);
            if (element) {
                if (element.tagName === "INPUT") {
                    element.placeholder = translations[lang][id];
                } else {
                    element.innerText = translations[lang][id];
                }
            }
        });
        updateChatLanguage();
        if((location.hash.split('?')[0].slice(1) || 'game') != 'register'
           && (location.hash.split('?')[0].slice(1) || 'game') != 'login')
            loadChat();
        document.getElementById("login_language_fr").classList.toggle("active", lang === "fr");
        document.getElementById("login_language_en").classList.toggle("active", lang === "en");
        document.getElementById("login_language_sp").classList.toggle("active", lang === "sp");
    }
    await loadTranslations();
    await loadTranslationsID();
    
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
            var username = document.getElementById("login_username");
            if(username != null)
                username = username.value;
            var password = document.getElementById('login_password');
            if(password != null)
                password = password.value;
    
            if (!username || !password) {
                showError(getTranslation("login_enterboth"));
                return;
            }
            if(isRegexUsername(username, 1) == 0)
                return;
    
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
                if (loginResponse){
                    handleRedirect('#game');
                    loadChat();
                }
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