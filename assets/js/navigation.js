// Common navigation functions
function updateNavigation() {
  const isAdmin = sessionStorage.getItem('isAdmin') === 'true';
  const nav = document.querySelector('.main-nav .nav');
  
  // Remove existing admin tickets link if it exists
  const existingAdminLink = nav.querySelector('li a[href="admin-tickets.html"]');
  if (existingAdminLink) {
    existingAdminLink.parentElement.remove();
  }

  // Add admin tickets link if user is admin
  if (isAdmin) {
    const supportLink = nav.querySelector('li a[href="tickets.html"]').parentElement;
    const adminLink = document.createElement('li');
    adminLink.innerHTML = '<a href="admin-tickets.html">Admin Tickets</a>';
    // Make it active if we're on the admin tickets page
    if (window.location.pathname.endsWith('admin-tickets.html')) {
      adminLink.querySelector('a').classList.add('active');
    }
    nav.insertBefore(adminLink, supportLink.nextSibling);
  }

  // Update active state for all nav items
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  nav.querySelectorAll('a').forEach(link => {
    if (link.getAttribute('href') === currentPage) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

// Check authentication and update navigation
function initializeNavigation(requireAuth = false) {
  const characterId = sessionStorage.getItem('characterId');
  if (requireAuth && !characterId) {
    window.location.href = 'signin.html';
    return;
  }
  updateNavigation();
}
