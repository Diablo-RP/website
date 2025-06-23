// Function to update login status UI
function updateLoginStatus() {
  const isLoggedIn = sessionStorage.getItem('userId') !== null;
  const loginStatus = document.getElementById('loginStatus');
  const loginLink = document.getElementById('loginLink');
  
  if (!loginStatus || !loginLink) return; // Skip if elements don't exist
  
  if (isLoggedIn) {
    loginStatus.classList.remove('logged-out');
    loginStatus.classList.add('logged-in');
    loginLink.textContent = 'Sign Out';
    loginLink.href = '#';
    loginLink.onclick = function(e) {
      e.preventDefault();
      sessionStorage.clear();
      window.location.reload();
    };
  } else {
    loginStatus.classList.remove('logged-in');
    loginStatus.classList.add('logged-out');
    loginLink.textContent = 'Sign In';
    loginLink.href = 'signin.html';
    loginLink.onclick = null;
  }
}

// Update login status when page loads
document.addEventListener('DOMContentLoaded', updateLoginStatus);
