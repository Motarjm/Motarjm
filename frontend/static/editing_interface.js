const editorArea = document.getElementById('editorArea');
const sidebarTitle = document.getElementById('sidebarTitle');
const pageInfo = document.getElementById('pageInfo');
const pagesList = document.getElementById('pagesList');
const pages = document.querySelectorAll('.document-page');
const thumbnails = document.querySelectorAll('.page-thumbnail');
const compWrappers = document.querySelectorAll('.comparison-page-wrapper');
const compareBtn = document.getElementById('toggleCompareBtn');
const comparisonArea = document.getElementById('comparisonArea');

let isComparing = false;

// Scroll to page on thumbnail click (only editor mode)
thumbnails.forEach(thumb => {
    thumb.addEventListener('click', () => {
        if (!isComparing) {
            const pageNum = thumb.getAttribute('data-page');
            const page = document.getElementById(`page-${pageNum}`);
            if (page) {
                page.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        } else {
            alert('الرجاء إنهاء وضع المقارنة للانتقال بين الصفحات.');
        }
    });
});

// Highlight current page while scrolling
const observer = new IntersectionObserver((entries) => {
    if (isComparing) return;

    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const pageId = entry.target.id.split('-')[1];
            thumbnails.forEach(thumb => {
                thumb.classList.toggle('active', thumb.getAttribute('data-page') === pageId);
            });
        }
    });
}, { root: editorArea, threshold: 0.6 });

pages.forEach(page => observer.observe(page));


// ---------------------------
//  TOGGLE COMPARISON MODE
// ---------------------------

compareBtn.addEventListener('click', () => {
    isComparing = !isComparing;

    if (isComparing) {
        enterCompareMode();
    } else {
        exitCompareMode();
    }
});

function enterCompareMode() {
    // Hide editor
    editorArea.classList.remove('active');
    editorArea.style.display = "none";

    // Show comparison
    comparisonArea.style.display = "flex";

    // Update sidebar text
    sidebarTitle.textContent = "وضع المقارنة";
    pageInfo.textContent = "عرض ثلاث نسخ من المستند";

    // Disable thumbnails highlight
    thumbnails.forEach(t => t.classList.remove('active'));

    // Change button text
    compareBtn.textContent = "إنهاء المقارنة";
}

function exitCompareMode() {
    // Show editor
    editorArea.classList.add('active');
    editorArea.style.display = "block";

    // Hide comparison view
    comparisonArea.style.display = "none";

    // Restore sidebar
    sidebarTitle.textContent = "صفحات المستند";
    pageInfo.textContent = thumbnails.length + " صفحات";

    // Restore first page active
    thumbnails[0].classList.add('active');

    compareBtn.textContent = "مقارنة";
}


// ---------------------------
// Placeholder Export Functions
// ---------------------------

function downloadDocument() {
    alert('جاري تحميل المستند بصيغة PDF...');
}

function exportWord() {
    alert('يتم الآن تصدير المستند إلى Word...');
}
