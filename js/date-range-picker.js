/**
 * Shared date range picker for maintenance pages - same UI/UX as dashboard.
 * Expects in DOM: #date-range-picker, #date-range-display, #calendar-popup (with #calendar-month-select, #calendar-year-select, #calendar-days).
 * Syncs selection to hidden inputs #date_from and #date_to (dd/mm/yyyy). Call init() with onChange to trigger search.
 */
(function() {
    let calendarStartDate = null;
    let calendarEndDate = null;
    let isSelectingRange = false;
    let calendarCurrentDate = new Date();
    let config = {
        dateFromId: 'date_from',
        dateToId: 'date_to',
        onChange: null,
        allowEmpty: false,
        placeholder: 'Select date range'
    };

    function formatDateDisplay(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${day}/${month}/${year}`;
    }

    function updateDateRangeDisplay() {
        const display = document.getElementById('date-range-display');
        if (!display) return;
        if (calendarStartDate && calendarEndDate) {
            display.textContent = formatDateDisplay(calendarStartDate) + ' - ' + formatDateDisplay(calendarEndDate);
        } else if (calendarStartDate) {
            display.textContent = formatDateDisplay(calendarStartDate) + ' - Select end date';
        } else {
            display.textContent = config.placeholder || 'Select date range';
        }
    }

    function syncToHiddenInputs() {
        const fromEl = document.getElementById(config.dateFromId);
        const toEl = document.getElementById(config.dateToId);
        if (fromEl) fromEl.value = calendarStartDate ? formatDateDisplay(calendarStartDate) : '';
        if (toEl) toEl.value = calendarEndDate ? formatDateDisplay(calendarEndDate) : '';
    }

    function toggleCalendar() {
        const popup = document.getElementById('calendar-popup');
        const picker = document.getElementById('date-range-picker');
        if (!popup || !picker) return;
        if (popup.style.display === 'none' || !popup.style.display) {
            var rect = picker.getBoundingClientRect();
            var barWidth = rect.width;
            var parent = picker.parentElement;
            if (parent) {
                var parentRect = parent.getBoundingClientRect();
                if (parent.classList && (parent.classList.contains('transaction-capture-date-row') || parent.classList.contains('transaction-date-range-group'))) {
                    barWidth = parentRect.width;
                } else if (parentRect.width > barWidth) {
                    barWidth = parentRect.width;
                }
            }
            popup.style.top = (rect.bottom + 8) + 'px';
            popup.style.left = rect.left + 'px';
            popup.style.width = barWidth + 'px';
            popup.style.minWidth = '';
            popup.style.maxWidth = '';
            popup.style.boxSizing = 'border-box';
            popup.style.display = 'block';
            initCalendar();
            renderCalendar();
        } else {
            popup.style.display = 'none';
        }
    }

    function initCalendar() {
        const today = new Date();
        if (!calendarStartDate && !config.allowEmpty) {
            calendarStartDate = new Date(today);
            calendarStartDate.setHours(0, 0, 0, 0);
            calendarEndDate = new Date(today);
            calendarEndDate.setHours(0, 0, 0, 0);
        }
        if (calendarStartDate && !calendarEndDate) {
            isSelectingRange = true;
        } else if (calendarStartDate && calendarEndDate) {
            isSelectingRange = false;
        }
        if (calendarStartDate) {
            calendarCurrentDate = new Date(calendarStartDate.getFullYear(), calendarStartDate.getMonth(), 1);
        } else {
            calendarCurrentDate = new Date(today.getFullYear(), today.getMonth(), 1);
        }
        const yearSelect = document.getElementById('calendar-year-select');
        if (yearSelect) {
            yearSelect.innerHTML = '';
            const currentYear = today.getFullYear();
            for (let year = 2022; year <= currentYear + 1; year++) {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year;
                if (year === calendarCurrentDate.getFullYear()) option.selected = true;
                yearSelect.appendChild(option);
            }
        }
        const monthSelect = document.getElementById('calendar-month-select');
        if (monthSelect) monthSelect.value = calendarCurrentDate.getMonth();
        updateDateRangeDisplay();
    }

    function changeMonth(delta) {
        calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() + delta);
        const monthSelect = document.getElementById('calendar-month-select');
        const yearSelect = document.getElementById('calendar-year-select');
        if (monthSelect) monthSelect.value = calendarCurrentDate.getMonth();
        if (yearSelect) yearSelect.value = calendarCurrentDate.getFullYear();
        renderCalendar();
    }

    function createDayElement(day, year, month, isOtherMonth) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        dayElement.textContent = day;
        const date = new Date(year, month, day);
        date.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (isOtherMonth) dayElement.classList.add('other-month');
        if (date.getTime() === today.getTime() && !isOtherMonth) dayElement.classList.add('today');
        if (calendarStartDate) {
            const startTime = calendarStartDate.getTime();
            const currentTime = date.getTime();
            if (calendarEndDate) {
                const endTime = calendarEndDate.getTime();
                if (currentTime === startTime && currentTime === endTime) {
                    dayElement.classList.add('selected', 'start-date', 'end-date');
                } else if (currentTime === startTime) {
                    dayElement.classList.add('start-date');
                } else if (currentTime === endTime) {
                    dayElement.classList.add('end-date');
                } else if (currentTime > startTime && currentTime < endTime) {
                    dayElement.classList.add('in-range');
                }
            } else {
                if (currentTime === startTime) dayElement.classList.add('start-date', 'selecting');
            }
        }
        dayElement.addEventListener('click', function(e) {
            e.stopPropagation();
            selectDate(date);
        });
        dayElement.addEventListener('mouseenter', function() {
            if (isSelectingRange && calendarStartDate && !calendarEndDate) highlightPreviewRange(date);
        });
        return dayElement;
    }

    function highlightPreviewRange(hoverDate) {
        const days = document.querySelectorAll('#calendar-popup .calendar-day');
        const startTime = calendarStartDate.getTime();
        const hoverTime = hoverDate.getTime();
        const yearSelect = document.getElementById('calendar-year-select');
        const monthSelect = document.getElementById('calendar-month-select');
        if (!yearSelect || !monthSelect) return;
        const year = parseInt(yearSelect.value, 10);
        const month = parseInt(monthSelect.value, 10);
        days.forEach(function(day) {
            day.classList.remove('preview-range', 'preview-end');
            const dayText = parseInt(day.textContent, 10);
            if (!dayText) return;
            let dayDate;
            if (day.classList.contains('other-month')) {
                if (dayText > 20) {
                    dayDate = new Date(year, month - 1, dayText);
                } else {
                    dayDate = new Date(year, month + 1, dayText);
                }
            } else {
                dayDate = new Date(year, month, dayText);
            }
            dayDate.setHours(0, 0, 0, 0);
            const dayTime = dayDate.getTime();
            const minTime = Math.min(startTime, hoverTime);
            const maxTime = Math.max(startTime, hoverTime);
            if (dayTime > minTime && dayTime < maxTime) day.classList.add('preview-range');
            else if (dayTime === hoverTime && dayTime !== startTime) day.classList.add('preview-end');
        });
    }

    function selectDate(date) {
        if (!calendarStartDate || (calendarStartDate && calendarEndDate)) {
            calendarStartDate = new Date(date);
            calendarEndDate = null;
            isSelectingRange = true;
        } else {
            if (date.getTime() < calendarStartDate.getTime()) {
                calendarEndDate = new Date(calendarStartDate);
                calendarStartDate = new Date(date);
            } else {
                calendarEndDate = new Date(date);
            }
            isSelectingRange = false;
            syncToHiddenInputs();
            updateDateRangeDisplay();
            if (typeof config.onChange === 'function') config.onChange();
            const popup = document.getElementById('calendar-popup');
            if (popup) popup.style.display = 'none';
        }
        renderCalendar();
        updateDateRangeDisplay();
    }

    function clearSelection(triggerOnChange) {
        calendarStartDate = null;
        calendarEndDate = null;
        isSelectingRange = false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        calendarCurrentDate = new Date(today.getFullYear(), today.getMonth(), 1);
        syncToHiddenInputs();
        updateDateRangeDisplay();
        renderCalendar();
        const popup = document.getElementById('calendar-popup');
        if (popup) popup.style.display = 'none';
        if (triggerOnChange !== false && typeof config.onChange === 'function') config.onChange();
    }

    function renderCalendar() {
        const yearSelect = document.getElementById('calendar-year-select');
        const monthSelect = document.getElementById('calendar-month-select');
        if (!yearSelect || !monthSelect) return;
        const year = parseInt(yearSelect.value, 10);
        const month = parseInt(monthSelect.value, 10);
        calendarCurrentDate = new Date(year, month, 1);
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const prevLastDay = new Date(year, month, 0);
        const firstDayWeek = firstDay.getDay();
        const lastDate = lastDay.getDate();
        const prevLastDate = prevLastDay.getDate();
        const daysContainer = document.getElementById('calendar-days');
        if (!daysContainer) return;
        daysContainer.innerHTML = '';
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        for (let i = firstDayWeek - 1; i >= 0; i--) {
            const day = prevLastDate - i;
            daysContainer.appendChild(createDayElement(day, year, month - 1, true));
        }
        for (let day = 1; day <= lastDate; day++) {
            daysContainer.appendChild(createDayElement(day, year, month, false));
        }
        const totalCells = daysContainer.children.length;
        const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
        for (let day = 1; day <= remainingCells; day++) {
            daysContainer.appendChild(createDayElement(day, year, month + 1, true));
        }
    }

    window.changeMonth = function(delta) {
        changeMonth(delta);
    };

    var RANGE_TEXTS = {
        'today': 'Today',
        'yesterday': 'Yesterday',
        'thisWeek': 'This Week',
        'lastWeek': 'Last Week',
        'thisMonth': 'This Month',
        'lastMonth': 'Last Month',
        'thisYear': 'This Year',
        'lastYear': 'Last Year'
    };

    function setQuickRange(range) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let startDate, endDate;
        switch (range) {
            case 'today':
                startDate = new Date(today);
                endDate = new Date(today);
                break;
            case 'yesterday':
                var yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                startDate = yesterday;
                endDate = yesterday;
                break;
            case 'thisWeek':
                var thisWeekStart = new Date(today);
                var dayOfWeek = thisWeekStart.getDay();
                var daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                thisWeekStart.setDate(thisWeekStart.getDate() - daysToMonday);
                startDate = thisWeekStart;
                endDate = new Date(today);
                break;
            case 'lastWeek':
                var lastWeekEnd = new Date(today);
                var lastWeekDayOfWeek = lastWeekEnd.getDay();
                var daysToLastSunday = lastWeekDayOfWeek === 0 ? 0 : lastWeekDayOfWeek;
                lastWeekEnd.setDate(lastWeekEnd.getDate() - daysToLastSunday - 1);
                var lastWeekStart = new Date(lastWeekEnd);
                lastWeekStart.setDate(lastWeekStart.getDate() - 6);
                startDate = lastWeekStart;
                endDate = lastWeekEnd;
                break;
            case 'thisMonth':
                startDate = new Date(today.getFullYear(), today.getMonth(), 1);
                endDate = new Date(today);
                break;
            case 'lastMonth':
                var lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                var lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
                startDate = lastMonth;
                endDate = lastMonthEnd;
                break;
            case 'thisYear':
                startDate = new Date(today.getFullYear(), 0, 1);
                endDate = new Date(today);
                break;
            case 'lastYear':
                startDate = new Date(today.getFullYear() - 1, 0, 1);
                endDate = new Date(today.getFullYear() - 1, 11, 31);
                break;
            default:
                return;
        }
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(0, 0, 0, 0);
        calendarStartDate = new Date(startDate);
        calendarEndDate = new Date(endDate);
        isSelectingRange = false;
        syncToHiddenInputs();
        updateDateRangeDisplay();
        var quickSelectText = document.getElementById('quick-select-text');
        if (quickSelectText) quickSelectText.textContent = RANGE_TEXTS[range] || 'Period';
        var dropdown = document.getElementById('quick-select-dropdown');
        if (dropdown) dropdown.classList.remove('show');
        if (typeof config.onChange === 'function') config.onChange();
    }

    function toggleQuickSelectDropdown() {
        var dropdown = document.getElementById('quick-select-dropdown');
        if (!dropdown) return;
        dropdown.classList.toggle('show');
    }

    window.toggleQuickSelectDropdown = toggleQuickSelectDropdown;
    window.selectQuickRange = setQuickRange;

    window.MaintenanceDateRangePicker = {
        init: function(options) {
            if (options) {
                if (options.dateFromId) config.dateFromId = options.dateFromId;
                if (options.dateToId) config.dateToId = options.dateToId;
                if (options.onChange) config.onChange = options.onChange;
                if (typeof options.allowEmpty === 'boolean') config.allowEmpty = options.allowEmpty;
                if (typeof options.placeholder === 'string' && options.placeholder.trim() !== '') {
                    config.placeholder = options.placeholder;
                }
            }
            // 如果隐藏输入里已有默认值（dd/mm/yyyy），优先用它们作为初始范围
            const fromEl = document.getElementById(config.dateFromId);
            const toEl = document.getElementById(config.dateToId);
            const parseDmy = function (val) {
                if (!val || !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(val.trim())) return null;
                const parts = val.trim().split('/').map(Number);
                const d = parts[0], m = parts[1], y = parts[2];
                const date = new Date(y, m - 1, d);
                if (isNaN(date.getTime())) return null;
                date.setHours(0, 0, 0, 0);
                return date;
            };
            const fromDate = fromEl ? parseDmy(fromEl.value) : null;
            const toDate = toEl ? parseDmy(toEl.value) : null;

            if (!calendarStartDate) {
                if (fromDate) {
                    calendarStartDate = new Date(fromDate);
                    calendarEndDate = toDate ? new Date(toDate) : new Date(fromDate);
                    calendarStartDate.setHours(0, 0, 0, 0);
                    calendarEndDate.setHours(0, 0, 0, 0);
                } else if (!config.allowEmpty) {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    calendarStartDate = new Date(today);
                    calendarEndDate = new Date(today);
                }
            }
            syncToHiddenInputs();
            updateDateRangeDisplay();
            const picker = document.getElementById('date-range-picker');
            if (picker) {
                picker.onclick = function(e) {
                    e.stopPropagation();
                    toggleCalendar();
                };
            }
            var monthSelect = document.getElementById('calendar-month-select');
            var yearSelect = document.getElementById('calendar-year-select');
            if (monthSelect) monthSelect.addEventListener('change', renderCalendar);
            if (yearSelect) yearSelect.addEventListener('change', renderCalendar);
            document.addEventListener('click', function(e) {
                const calendar = document.getElementById('date-range-picker');
                const popup = document.getElementById('calendar-popup');
                if (calendar && popup && !calendar.contains(e.target) && !popup.contains(e.target)) {
                    popup.style.display = 'none';
                }
                var qsDropdown = document.getElementById('quick-select-dropdown');
                var qsToggle = e.target.closest && (e.target.closest('.quick-select-dropdown-toggle') || e.target.closest('#quick-select-dropdown'));
                if (qsDropdown && !qsToggle) qsDropdown.classList.remove('show');
            });
        },
        setQuickRange: setQuickRange,
        clear: function() {
            clearSelection(true);
        },
        getDateFrom: function() {
            const fromEl = document.getElementById(config.dateFromId);
            return fromEl ? fromEl.value : '';
        },
        getDateTo: function() {
            const toEl = document.getElementById(config.dateToId);
            return toEl ? toEl.value : '';
        }
    };
})();