const editorArea = document.getElementById('editorArea');
        const comparisonArea = document.getElementById('comparisonArea');
        const toggleCompareBtn = document.getElementById('toggleCompareBtn');
        const sidebarTitle = document.getElementById('sidebarTitle');
        const pageInfo = document.getElementById('pageInfo');
        const pagesList = document.getElementById('pagesList');
        const pages = document.querySelectorAll('.document-page');
        const thumbnails = document.querySelectorAll('.page-thumbnail');
        const compWrappers = document.querySelectorAll('.comparison-page-wrapper');

        let isComparing = false;

        // Function to scroll comparison pages simultaneously
        function syncScroll(e) {
            if (!isComparing) return;
            const target = e.target;

            // Calculate scroll percentage
            const scrollPercent = target.scrollTop / (target.scrollHeight - target.clientHeight);

            compWrappers.forEach(wrapper => {
                if (wrapper !== target) {
                    // Apply the scroll percentage to the other wrapper
                    const otherScrollTop = scrollPercent * (wrapper.scrollHeight - wrapper.clientHeight);
                    // Temporarily remove listener to prevent infinite loop
                    wrapper.removeEventListener('scroll', syncScroll);
                    wrapper.scrollTop = otherScrollTop;
                    wrapper.addEventListener('scroll', syncScroll);
                }
            });
        }

        // Attach scroll event listeners to all comparison wrappers
        compWrappers.forEach(wrapper => {
            wrapper.addEventListener('scroll', syncScroll);
        });

        // Function to toggle between editor and comparison view
        toggleCompareBtn.addEventListener('click', () => {
            isComparing = !isComparing;

            if (isComparing) {
                // Switch to Comparison Mode
                editorArea.classList.remove('active');
                editorArea.style.display = 'none';
                comparisonArea.classList.add('active');
                comparisonArea.style.display = 'flex';

                toggleCompareBtn.textContent = '❌ إنهاء المقارنة';
                sidebarTitle.textContent = 'أعمدة المقارنة';
                pageInfo.style.display = 'none';
                pagesList.style.display = 'none'; // Hide list

                // Synchronize scroll on entry (set all to top)
                compWrappers.forEach(wrapper => wrapper.scrollTop = 0);

            } else {
                // Switch back to Editor Mode
                editorArea.classList.add('active');
                editorArea.style.display = 'flex';
                comparisonArea.classList.remove('active');
                comparisonArea.style.display = 'none';

                toggleCompareBtn.textContent = 'مقارنة';
                sidebarTitle.textContent = 'صفحات المستند';
                pageInfo.style.display = 'block';
                pagesList.style.display = 'block'; // Show list
            }
        });


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