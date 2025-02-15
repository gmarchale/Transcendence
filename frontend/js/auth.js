function setCookie(name, value, days) {
    let expires = "";
    if (days) {
        let date = new Date();
        date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + encodeURIComponent(value) + expires + "; path=/";
}

function getCookie(name) {
    let match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
}

function deleteCookie(name) {
    document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/";
}

function deleteAllCookies() {
    document.cookie.split(";").forEach(cookie => {
        let name = cookie.split("=")[0].trim();
        document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/";
    });
}

async function loadLoginInfos(){
    try {
        const response = await fetch('/api/users/profile/');
        if (response.ok) {
            const userData = await response.json();
            setCookie("username", userData.username);
            setCookie("avatar", userData.avatar);
            return true;
        }
    } catch (error) {
        console.error('Error checking auth:', error);
    }
    return false;
}

async function checkAuth() {
    try {
        const response = await fetch('/api/users/profile/');
        return response.ok
    } catch (error) {
        console.error('Error checking auth:', error);
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
		}
	} catch (error) {
		console.error('Error checking auth:', error);
	}
}