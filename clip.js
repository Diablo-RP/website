// Predefined list of Medal embed URLs
const clipUrls = [
    "https://medal.tv/clip/iVfqWIgU567i5GKs6/vpzrTsQ2w?invite=cr-MSxzM2gsNTI4OTgwNDIs",
    "https://medal.tv/clip/iVgjfcTGZTUEEimxW/vpeQp7qzP?invite=cr-MSw4TGssLA",
    "https://medal.tv/clip/iYz0ehISk0BCtDKMG/vp3TRTaBe?invite=cr-MSw3dnMsLA"
];

let currentClipIndex = 0;
const videoPlayer = document.getElementById('videoPlayer');

/**
 * Starts playing the current clip and sets up the next one.
 */
function playClip() {
    const url = clipUrls[currentClipIndex];
    videoPlayer.innerHTML = ''; // Clear previous video

    if (url.includes('medal.tv')) {
        // Embed Medal clip directly
        const iframe = document.createElement('iframe');
        iframe.src = `${url}&autoplay=true`;
        iframe.width = "100%";
        iframe.height = "100%";
        iframe.style.border = "none";
        iframe.allow = "autoplay";
        iframe.allowFullscreen = true;

        // Simulate interaction by focusing the iframe after loading
        iframe.onload = () => {
            iframe.contentWindow.focus();
        };

        videoPlayer.appendChild(iframe);
    } else {
        console.error(`Unsupported URL format: ${url}`);
    }

    // Move to the next clip
    currentClipIndex = (currentClipIndex + 1) % clipUrls.length;

    // Schedule the next clip
    setTimeout(playClip, 15000); // Play each clip for 15 seconds
}

// Start autoplaying clips when the page loads
window.addEventListener('load', playClip);
