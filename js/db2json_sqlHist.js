// sqlHistoryUI.js
// This file contains the dropdown resizing and wrapper sync logic for SQL history UI.

document.addEventListener('DOMContentLoaded', () => {
    const textarea = document.getElementById('sqlInput');
    const wrapper = textarea && textarea.closest('.sqlInput-copy-wrapper');
    const dropdown = document.getElementById('sqlHistoryDropdown');

    // Clear any legacy inline height that may remain from prior versions
    if (wrapper) wrapper.style.height = '';

    // Keep wrapper width in sync with textarea resize (do NOT force height)
    if (textarea && wrapper) {
        const syncWrapperSize = () => {
            wrapper.style.width = textarea.offsetWidth + 'px';
            // Don't force height; wrapper must grow to contain submit row, etc.
            // wrapper.style.height = textarea.offsetHeight + 'px';
        };
        syncWrapperSize();
        const observerWrap = new ResizeObserver(syncWrapperSize);
        observerWrap.observe(textarea);
        window.addEventListener('resize', syncWrapperSize);
    }

    // Keep dropdown width in sync with wrapper
    if (wrapper && dropdown) {
        const syncDropdownWidth = () => {
            dropdown.style.width = wrapper.offsetWidth + 'px';
        };
        syncDropdownWidth();
        const observerDropdown = new ResizeObserver(syncDropdownWidth);
        observerDropdown.observe(wrapper);
        window.addEventListener('resize', syncDropdownWidth);
    }
});
