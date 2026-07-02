/**
 * Riskebiz.com - Interactive Features
 * Provides mobile menu drawer functionality, header scroll styling,
 * and scroll-reveal transitions.
 */

document.addEventListener('DOMContentLoaded', () => {
    initMobileMenu();
    initHeaderScroll();
    initScrollReveal();
});

/**
 * Mobile Navigation Drawer Toggle and Accessibility Controls
 */
function initMobileMenu() {
    const toggleBtn = document.querySelector('.mobile-menu-toggle');
    const drawer = document.querySelector('.mobile-nav-drawer');
    const menuIcon = toggleBtn ? toggleBtn.querySelector('.material-symbols-outlined') : null;
    
    if (!toggleBtn || !drawer) return;

    function openMenu() {
        drawer.classList.add('open');
        toggleBtn.setAttribute('aria-expanded', 'true');
        if (menuIcon) menuIcon.textContent = 'close';
        document.body.style.overflow = 'hidden'; // Prevent scrolling
        
        // Trap focus inside mobile nav drawer for accessibility
        const focusableElements = drawer.querySelectorAll('a, button');
        if (focusableElements.length > 0) {
            focusableElements[0].focus();
        }
    }

    function closeMenu() {
        drawer.classList.remove('open');
        toggleBtn.setAttribute('aria-expanded', 'false');
        if (menuIcon) menuIcon.textContent = 'menu';
        document.body.style.overflow = ''; // Re-enable scrolling
    }

    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = drawer.classList.contains('open');
        if (isOpen) {
            closeMenu();
        } else {
            openMenu();
        }
    });

    // Close menu when clicking outside the drawer
    document.addEventListener('click', (e) => {
        if (drawer.classList.contains('open') && !drawer.contains(e.target) && !toggleBtn.contains(e.target)) {
            closeMenu();
        }
    });

    // Close menu on Escape key press
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && drawer.classList.contains('open')) {
            closeMenu();
            toggleBtn.focus();
        }
    });
}

/**
 * Add subtle drop shadow to site header when page is scrolled
 */
function initHeaderScroll() {
    const header = document.querySelector('.site-header');
    if (!header) return;

    const handleScroll = () => {
        if (window.scrollY > 50) {
            header.classList.add('shadow-sm');
        } else {
            header.classList.remove('shadow-sm');
        }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Initial check in case of page refresh
}

/**
 * Scroll Reveal Animations using IntersectionObserver
 */
function initScrollReveal() {
    const revealElements = document.querySelectorAll('.reveal');
    if (revealElements.length === 0) return;

    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.15
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
                // Unobserve once revealed to keep layout performant
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    revealElements.forEach(el => {
        observer.observe(el);
    });
}
