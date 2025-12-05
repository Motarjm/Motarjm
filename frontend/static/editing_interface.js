const editorArea = document.getElementById('editorArea');
        const sidebarTitle = document.getElementById('sidebarTitle');
        const pageInfo = document.getElementById('pageInfo');
        const pagesList = document.getElementById('pagesList');
        const pages = document.querySelectorAll('.document-page');
        const thumbnails = document.querySelectorAll('.page-thumbnail');
        const compWrappers = document.querySelectorAll('.comparison-page-wrapper');

        let isComparing = false;

        // Scroll to page on thumbnail click (Only works in editor view)
        document.querySelectorAll('.page-thumbnail').forEach(thumb => {
            thumb.addEventListener('click', () => {
                if (!isComparing) {
                    const pageNum = thumb.getAttribute('data-page');
                    const page = document.getElementById(`page-${pageNum}`);
                    if (page) {
                        page.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                } else {
                    alert('الرجاء إنهاء وضع المقارنة للقفز إلى صفحة معينة في المحرر.');
                }
            });
        });

        // Highlight current page using Intersection Observer (Only for Editor view)
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
        }, { root: document.getElementById('editorArea'), threshold: 0.6 });

        pages.forEach(page => observer.observe(page));

        // Placeholder functions
        function downloadDocument() {
            alert('جاري تحميل المستند بصيغة PDF...');
        }

        function exportWord() {
            alert('يتم الآن تصدير المستند إلى Word...');
        }