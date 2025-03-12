let previousCookies = getAllCookies();
let modifiedCookies = new Set();

function setCookie(name, value, days) {
    let expires = "";
    if (days) {
        let date = new Date();
        date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + encodeURIComponent(value) + expires + "; path=/";
    modifiedCookies.add(name);
}

function getCookie(name) {
    let match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    let returnval = match ? decodeURIComponent(match[2]) : null;
    return returnval;
}

function getAllCookies() {
    const cookies = document.cookie.split('; ').filter(cookie => cookie.trim() !== '');
    const cookieObj = {};
    cookies.forEach(cookie => {
        const [name, value] = cookie.split('=');
        cookieObj[name] = value;
    });
    return cookieObj;
}

async function cookieLogout(){
    logout();
}

function initAuth(){
    setInterval(() => {
        const currentCookies = getAllCookies();
        
        Object.keys(previousCookies).forEach(cookieName => {
            if (cookieName === "csrftoken") {
                return;
            }

            if (!modifiedCookies.has(cookieName)) {
                if (!(cookieName in currentCookies)){
                    console.error("cookie "+cookieName+" deleted")
                    cookieLogout();
                } else if (previousCookies[cookieName] !== currentCookies[cookieName]){
                    console.error("cookie "+cookieName+" edited from " + previousCookies[cookieName] +" to "+ currentCookies[cookieName])
                    cookieLogout();
                }
            }
        });
    
        // Object.keys(currentCookies).forEach(cookieName => {
        //     if (!(cookieName in previousCookies) && !modifiedCookies.has(cookieName)) {
        //         console.log(`Cookie "${cookieName}" added.`);
        //     }
        // });
    
        previousCookies = currentCookies;
        modifiedCookies.clear();
    }, 1000);
}

function deleteCookie(name) {
    document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/";
    modifiedCookies.add(name);
}

function deleteAllCookies() {
    document.cookie.split(";").forEach(cookie => {
        let name = cookie.split("=")[0].trim();
        deleteCookie(name)
    });
}


async function loadLoginInfos(){
    try {
        const response = await fetch('/api/users/profile/');
        if (response.ok) {
            const userData = await response.json();
            setCookie("username", userData.username);
            setCookie("id", userData.id);
            if(await getavatar(userData.id) == null)
                return false;
            else 
                return true;
        }
    } catch (error) {
        console.error('Error checking auth:', error);
    }
    return false;
}

async function checkAuth(nologout) {
    try {
        const response = await fetch('/api/users/profile/');
        if((getCookie("username") == null || getCookie("id") == null || getCookie("avatar") == null) && getHashParam("oauth") == null){
            console.error("nol = "+nologout)
            if(nologout == null)
                logout();
            return false;
        }
        return response.ok
    } catch (error) {
        console.error('Error checking auth:', error);
        logout();
        return false;
    }
}

async function getid(){
	try {
		const response = await fetch('/api/users/user_info/');
		if (response.ok) {
			const userData = await response.json();
			setCookie("id", userData.id);
            console.log("id = " + userData.id);
            return userData.id;
		}
	} catch (error) {
		console.error('Error checking auth:', error);
	}
    return null;
}

async function getavatar(id){
	try {
		const response = await fetch("/api/users/get_avatar/"+id+"/");
		if (response.ok) {
			const userData = await response.json();
            if(userData.avatar == null)
			    setCookie("avatar", "null");
            else setCookie("avatar", userData.avatar);
            console.log("avatar = " + userData.avatar);
            if(userData.avatar == null)
                return "null";
            return userData.avatar;
		}
	} catch (error) {
		console.error('Error checking auth:', error);
	}
    return null;
}

async function logout(){
    console.error("[LOGING OUT]")
    try {
        let csrft = getCookie('csrftoken');
        if(csrft == null)
            return;
        
        const response = await fetch('/api/users/logout/', { method: 'POST', headers: {'X-CSRFToken': csrft} });
        
        if (!response.ok) {
            console.error('Error while logging out:', await response.text());
        }
    } catch (error) {
        console.error('Error while logging out:', error);
    } finally {
        deleteAllCookies();
        window.location.href = "#login";
    }
    
}