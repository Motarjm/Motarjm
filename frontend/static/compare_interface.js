function toggleSegment(element) {
            // Check if the click originated from the editable area
            const isEditing = element.querySelector('.final-text').matches(':focus');

            // Prevent closing/opening if the user is actively typing
            if (isEditing && element.classList.contains('active')) {
                return;
            }

            // Close other open segments (Accordion style)
            const currentActive = document.querySelector('.segment.active');
            if (currentActive && currentActive !== element) {
                currentActive.classList.remove('active');
            }

            // Toggle current
            element.classList.toggle('active');

            // Scroll into view if opening
            if (element.classList.contains('active')) {
                setTimeout(() => {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 300);
            }
        }

        function switchTab(event, tabId) {
            event.stopPropagation(); // Prevent segment from toggling

            const panel = event.target.closest('.comparison-panel');

            // Remove active class from all tabs and content in this panel
            const tabs = panel.querySelectorAll('.tab-btn');
            const contents = panel.querySelectorAll('.tab-content');

            tabs.forEach(tab => tab.classList.remove('active'));
            contents.forEach(content => content.classList.remove('active'));

            // Add active class to clicked tab and corresponding content
            event.target.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        }

        // Add event listener to prevent expansion when double-clicking to select text
        document.querySelectorAll('.final-text').forEach(editor => {
            editor.addEventListener('mousedown', (e) => {
                e.stopPropagation(); // Stop the click from bubbling up to the segment toggle
            });
        });

        // Prevent tab clicks from closing the segment
        document.querySelectorAll('.tab-nav').forEach(nav => {
            nav.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        });