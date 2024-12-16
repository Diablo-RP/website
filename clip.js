const parent = window.location.hostname;

// Predefined list of Medal embed URLs
const clipMedalUrls = [
    "https://medal.tv/clip/iVfqWIgU567i5GKs6/vpzrTsQ2w?invite=cr-MSxzM2gsNTI4OTgwNDIs",
    "https://medal.tv/clip/iVgjfcTGZTUEEimxW/vpeQp7qzP?invite=cr-MSw4TGssLA",
    "https://medal.tv/clip/iYz0ehISk0BCtDKMG/vp3TRTaBe?invite=cr-MSw3dnMsLA",
    "https://medal.tv/clip/iNnjHmqMRCXpVDZj5/vp7XrpsVT?invite=cr-MSxsUFEsLA",
    "https://medal.tv/clip/iHiZL3ej1XC8eQAgJ/vptFhd5gM?invite=cr-MSxBMjAsLA",
    "https://medal.tv/clip/iFflk2iSCg0qXEmJI/vpExNmUdM?invite=cr-MSxoTlYsLA",
    "https://medal.tv/clip/iBLUT2NwcMoVwetQX/vpSkz5S8O?invite=cr-MSw2UTQsLA",
    "https://medal.tv/clip/isSkKyOW1LqaAARVw/vpz08YfEg?invite=cr-MSxwZ1UsLA",
    "https://medal.tv/clip/ioPB8rawdx9lOy6hu/vpNuSthpg?invite=cr-MSx1MnYsLA",
    "https://medal.tv/clip/ioOHEu9Ga14Ztce6K/vpdvsaKHJ?invite=cr-MSxYNVUsLA",
    "https://medal.tv/clip/im9hH13KLFcrnZ47t/vppAIGngQ?invite=cr-MSxWY2ksLA",


];



// Predefined list of Twitch embed URLs
const clipTwitchUrls = [
    `https://clips.twitch.tv/embed?clip=PiliableVainPeppermintOpieOP-jZRjNjoWJ2cZgLbM&parent=diablo-rp.com&autoplay=true`,
    `https://clips.twitch.tv/embed?clip=PluckyFitOcelotAMPEnergy-Vu3dTfdcJU8xr2ET&parent=diablo-rp.com&autoplay=true`
];

const videoPlayer = document.getElementById('videoPlayer');

/**
 * Selects a random clip URL from either Medal or Twitch lists.
 * @returns {string} A random URL from one of the clip lists.
 */
function getRandomClip() {
    const isMedal = Math.random() < 0.5; // 50% chance to pick from Medal or Twitch
    const clipList = isMedal ? clipMedalUrls : clipTwitchUrls;
    const randomIndex = Math.floor(Math.random() * clipList.length);
    return clipList[randomIndex];
}

/**
 * Starts playing a random clip and sets up the next one.
 */
function playClip() {
    const url = getRandomClip();
    videoPlayer.innerHTML = ''; // Clear previous video

    if (url.includes('medal.tv')) {
        // Embed Medal clip
        const iframe = document.createElement('iframe');
        iframe.src = `${url}&autoplay=true`;
        iframe.width = "100%";
        iframe.height = "100%";
        iframe.style.border = "none";
        iframe.allow = "autoplay";
        iframe.allowFullscreen = true;

        videoPlayer.appendChild(iframe);
    } else if (url.includes('twitch.tv')) {
        // Embed Twitch clip
        const iframe = document.createElement('iframe');
        iframe.src = url; // Twitch embed URL with autoplay
        iframe.width = "100%";
        iframe.height = "100%";
        iframe.frameBorder = "0";
        iframe.scrolling = "no";
        iframe.allowFullscreen = true;

        // Add audio playback for Twitch embeds if allowed
        iframe.onload = () => {
            iframe.contentWindow.postMessage(
                { event: 'play', params: { muted: false } },
                '*'
            );
        };

        videoPlayer.appendChild(iframe);
    } else {
        console.error(`Unsupported URL format: ${url}`);
    }

    // Schedule the next random clip
    setTimeout(playClip, 30000); // Play each clip for 15 seconds
}

// Start autoplaying random clips when the page loads
window.addEventListener('load', playClip);
