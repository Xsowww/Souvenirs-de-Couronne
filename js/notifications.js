// Notification system
const Notifications = {
    container: null,

    init() {
        this.container = document.getElementById('notifications');
    },

    add(message, type) {
        type = type || '';
        const notif = document.createElement('div');
        notif.className = 'notification' + (type ? ' ' + type : '');
        notif.textContent = message;
        this.container.appendChild(notif);

        // Auto-remove after 4 seconds
        setTimeout(() => {
            notif.style.opacity = '0';
            notif.style.transition = 'opacity 0.5s';
            setTimeout(() => {
                if (notif.parentNode) notif.parentNode.removeChild(notif);
            }, 500);
        }, 4000);

        // Keep max 5 notifications
        while (this.container.children.length > 5) {
            this.container.removeChild(this.container.firstChild);
        }
    }
};
