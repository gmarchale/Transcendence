// check if user is still active
function startHeartbeat() {
    setInterval(() => {
        fetch('/api/users/heartbeat/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            }
        });
    }, 30000);
}

// Get CSRF token
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

// Start heartbeat when page loads
document.addEventListener('DOMContentLoaded', () => {
    if (isLoggedIn()) {
        startHeartbeat();
    }
});

// Get online status for specific user
function getUserOnlineStatus(userId) {
    return fetch(`/api/users/online/${userId}/`)
        .then(response => response.json())
        .then(data => data.is_online);
}

// Get all online users
function getOnlineUsers() {
    return fetch('/api/users/online/')
        .then(response => response.json());
}

// Update online indicators
function updateOnlineIndicators() {
    getOnlineUsers().then(users => {
        // Create a set of online user IDs for quick lookup
        const onlineUserIds = new Set(users.map(user => user.id));
        
        // Update all user indicators on the page
        document.querySelectorAll('.user-status-indicator').forEach(indicator => {
            const userId = indicator.getAttribute('data-user-id');
            if (onlineUserIds.has(parseInt(userId))) {
                indicator.classList.add('online');
                indicator.classList.remove('offline');
            } else {
                indicator.classList.add('offline');
                indicator.classList.remove('online');
            }
        });
    });
}

// Update online status every minute
setInterval(updateOnlineIndicators, 60000);
// Initial update
updateOnlineIndicators();