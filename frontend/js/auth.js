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
            setCookie("id", userData.id);
            await getavatar();
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
            return userData.id;
		}
	} catch (error) {
		console.error('Error checking auth:', error);
	}
    return null;
}

async function getavatar(){
	try {
		const response = await fetch("/api/users/get_avatar/"+getCookie("id")+"/");
		if (response.ok) {
			const userData = await response.json();
            if(userData.avatar == null)
			    setCookie("avatar", "null");
            else setCookie("avatar", userData.avatar);
            console.log("avatar = " + userData.avatar);
            return userData.avatar;
		}
	} catch (error) {
		console.error('Error checking auth:', error);
	}
    return null;
}

