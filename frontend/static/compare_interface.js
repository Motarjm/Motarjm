// Attach click listeners to segments
document.querySelectorAll('.segment').forEach(seg => {
    seg.addEventListener('click', function () {
        toggleSegment(this);
    });
});

function toggleSegment(element) {
    // Check if user is typing in the editable field
    const editor = element.querySelector('.final-text');
    const isEditing = (document.activeElement === editor);

    if (isEditing && element.classList.contains('active')) {
        return;
    }

    // Close any open segment
    const currentActive = document.querySelector('.segment.active');
    if (currentActive && currentActive !== element) {
        currentActive.classList.remove('active');
    }

    // Toggle current
    element.classList.toggle('active');

    // Smooth scroll
    if (element.classList.contains('active')) {
        setTimeout(() => {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
    }
}

function switchTab(event, tabId) {
    event.stopPropagation();

    const panel = event.target.closest('.comparison-panel');

    const tabs = panel.querySelectorAll('.tab-btn');
    const contents = panel.querySelectorAll('.tab-content');

    tabs.forEach(tab => tab.classList.remove('active'));
    contents.forEach(content => content.classList.remove('active'));

    event.target.classList.add('active');
    document.getElementById(tabId).classList.add('active');
}

// Prevent collapse when clicking inside editable text
document.querySelectorAll('.final-text').forEach(editor => {
    editor.addEventListener('mousedown', (e) => {
        e.stopPropagation();
    });
});

// Prevent collapse when clicking inside tab navigation
document.querySelectorAll('.tab-nav').forEach(nav => {
    nav.addEventListener('click', (e) => {
        e.stopPropagation();
    });
});
