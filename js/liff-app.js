/* ================================================================
   CMMS-TOPPAN — LINE LIFF (LINE Front-end Framework) Integration
   ================================================================ */
'use strict';

window.CMMS_LIFF = {
    liffId: window.LINE_LIFF_ID || '',
    profile: null,
    isLoggedIn: false,
    isInClient: false,

    async init() {
        if (!window.liff) return;

        const id = this.liffId || window.LINE_LIFF_ID;
        if (!id || id === 'YOUR_LINE_LIFF_ID' || id.includes('YOUR_LINE')) {
            return;
        }

        try {
            await liff.init({ liffId: id });
            this.isInClient = liff.isInClient();
            this.isLoggedIn = liff.isLoggedIn();

            if (this.isInClient) {
                document.body.classList.add('in-line-liff');
            }

            if (this.isLoggedIn) {
                this.profile = await liff.getProfile();
                this.onLIFFAuthenticated(this.profile);
            }
        } catch (err) {
            console.log('LIFF optional mode notice:', err ? err.message : 'Desktop mode');
        }
    },

    onLIFFAuthenticated(profile) {
        console.log('LIFF User Logged In:', profile.displayName, profile.userId);
        
        const avatarBtn = document.getElementById('user-menu-btn');
        if (avatarBtn && profile.pictureUrl) {
            avatarBtn.style.backgroundImage = `url(${profile.pictureUrl})`;
            avatarBtn.style.backgroundSize = 'cover';
            avatarBtn.textContent = '';
        }

        const lineInput = document.getElementById('line_user_id');
        if (lineInput && !lineInput.value) {
            lineInput.value = profile.userId;
        }
    },

    closeLIFF() {
        if (window.liff && liff.isInClient()) {
            liff.closeWindow();
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    if (window.CMMS_LIFF) window.CMMS_LIFF.init();
});
