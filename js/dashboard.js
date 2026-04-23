// 构造 API 绝对 URL（与 processlist/datacapture 一致，避免 404）
function buildApiUrl(pathAndQuery) {
    const pathname = window.location.pathname || '/';
    const basePath = pathname.replace(/[^/]*$/, '') || '/';
    const base = window.location.origin + basePath;
    return new URL(pathAndQuery, base).href;
}
const API_BASE_URL = 'api/transactions/dashboard_api.php';
let trendChart = null;
let dateRange = {
    startDate: null,
    endDate: null
};
let startDateValue = { year: null, month: null, day: null };
let endDateValue = { year: null, month: null, day: null };
let monthDateValue = { year: null, month: null };
let currentDatePicker = null;
let currentDateType = null;

// 日历选择器变量
let calendarCurrentDate = new Date();
let calendarStartDate = null;
let calendarEndDate = null;
let isSelectingRange = false;

// 存储图表元数据（用于 tooltip）
let chartMetadata = {
    sortedDates: [],
    capitalData: [],
    expensesData: [],
    profitData: [],
    cardProfitDisplay: 0,
    cardExpensesDisplay: 0
};

// 当前选择的图表数据类型（'all', 'capital', 'expenses', 'profit'）
let selectedChartDataType = 'all';

// 当前选择的范围类型（用于判断是否按月份显示）
let currentRangeType = null; // 'year' 表示年份范围，null 表示其他范围

// 判断当前是否应按月份聚合显示图表（年份范围或跨越多个月的自定义范围）
function shouldAggregateByMonth() {
    try {
        if (currentRangeType === 'year') return true;
        if (!dateRange || !dateRange.startDate || !dateRange.endDate) return false;
        const start = new Date(dateRange.startDate);
        const end = new Date(dateRange.endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        // 计算跨越的月份数（含首尾），例如 2025-11 ~ 2026-02 → 4 个月
        const monthSpan =
            (end.getFullYear() - start.getFullYear()) * 12 +
            (end.getMonth() - start.getMonth()) +
            1;
        // 跨越 3 个月及以上时按月聚合；1-2 个月仍按天显示
        return monthSpan >= 3;
    } catch (e) {
        return false;
    }
}

// 初始化增强日期选择器
function initEnhancedDatePickers() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    const currentDay = today.getDate();

    // 计算当月的第一天
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    firstDayOfMonth.setHours(0, 0, 0, 0);

    // 初始化日历选择器默认值为当月1号至今天
    calendarStartDate = new Date(firstDayOfMonth);
    calendarEndDate = new Date(today);

    const startYear = firstDayOfMonth.getFullYear();
    const startMonth = firstDayOfMonth.getMonth() + 1;
    const startDay = firstDayOfMonth.getDate();

    dateRange = {
        startDate: `${startYear}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`,
        endDate: `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`
    };

    startDateValue = {
        year: startYear,
        month: startMonth,
        day: startDay
    };

    endDateValue = {
        year: currentYear,
        month: currentMonth,
        day: currentDay
    };

    monthDateValue = {
        year: null,
        month: null
    };

    updateDateDisplay('month');
    updateDateRangeDisplay();

    document.addEventListener('click', function (e) {
        if (!e.target.closest('.enhanced-date-picker')) {
            hideAllDropdowns();
        }
    });
}

// 兼容性：保留旧函数名
function initDatePickers() {
    initEnhancedDatePickers();
}

function updateDateDisplay(prefix) {
    if (prefix === 'month') {
        const monthYearDisplay = document.getElementById('month-year-display');
        const monthMonthDisplay = document.getElementById('month-month-display');
        if (monthYearDisplay) {
            monthYearDisplay.textContent = monthDateValue.year || '--';
        }
        if (monthMonthDisplay) {
            monthMonthDisplay.textContent = monthDateValue.month ? String(monthDateValue.month).padStart(2, '0') : '--';
        }
    } else {
        // 兼容旧的 start/end 显示（如果存在）
        const yearEl = document.getElementById(`${prefix}-year-display`);
        const monthEl = document.getElementById(`${prefix}-month-display`);
        const dayEl = document.getElementById(`${prefix}-day-display`);
        if (yearEl && monthEl && dayEl) {
            const dateValue = prefix === 'start' ? startDateValue : endDateValue;
            yearEl.textContent = dateValue.year;
            monthEl.textContent = String(dateValue.month).padStart(2, '0');
            dayEl.textContent = String(dateValue.day).padStart(2, '0');
        }
    }
}

function showDateDropdown(prefix, type) {
    hideAllDropdowns();
    const dropdown = document.getElementById(`${prefix}-dropdown`);
    const datePicker = document.getElementById(`${prefix}-date-picker`);

    if (!dropdown || !datePicker) return;

    currentDatePicker = prefix;
    currentDateType = type;

    datePicker.querySelectorAll('.date-part').forEach(part => {
        part.classList.remove('active');
    });
    const targetPart = datePicker.querySelector(`[data-type="${type}"]`);
    if (targetPart) {
        targetPart.classList.add('active');
    }

    generateDropdownContent(prefix, type);
    dropdown.classList.add('show');
}

function hideAllDropdowns() {
    document.querySelectorAll('.date-dropdown').forEach(dropdown => {
        dropdown.classList.remove('show');
    });
    document.querySelectorAll('.date-part').forEach(part => {
        part.classList.remove('active');
    });
    currentDatePicker = null;
    currentDateType = null;
}

function generateDropdownContent(prefix, type) {
    const dropdown = document.getElementById(`${prefix}-dropdown`);
    if (!dropdown) return;

    let dateValue;
    if (prefix === 'month') {
        dateValue = monthDateValue;
    } else {
        dateValue = prefix === 'start' ? startDateValue : endDateValue;
    }
    const today = new Date();

    dropdown.innerHTML = '';

    if (type === 'year') {
        const yearGrid = document.createElement('div');
        yearGrid.className = 'year-grid';
        const currentYear = today.getFullYear();
        const startYear = 2022;
        const endYear = currentYear + 1;

        for (let year = startYear; year <= endYear; year++) {
            const yearOption = document.createElement('div');
            yearOption.className = 'date-option';
            yearOption.textContent = year;
            if (year === dateValue.year) yearOption.classList.add('selected');
            if (year === currentYear) yearOption.classList.add('today');
            yearOption.addEventListener('click', function () {
                selectDateValue(prefix, 'year', year);
            });
            yearGrid.appendChild(yearOption);
        }
        dropdown.appendChild(yearGrid);
    } else if (type === 'month') {
        const monthGrid = document.createElement('div');
        monthGrid.className = 'month-grid';

        if (prefix === 'month') {
            // 月份选择器的月份下拉：添加"无"选项
            const noneOption = document.createElement('div');
            noneOption.className = 'date-option';
            noneOption.textContent = 'None';
            noneOption.style.gridColumn = '1 / -1';
            if (!dateValue.month) noneOption.classList.add('selected');
            noneOption.addEventListener('click', function () {
                selectDateValue(prefix, 'month', null);
            });
            monthGrid.appendChild(noneOption);
        }

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        months.forEach((monthName, index) => {
            const monthValue = index + 1;
            const monthOption = document.createElement('div');
            monthOption.className = 'date-option';
            monthOption.textContent = monthName;
            if (monthValue === dateValue.month) monthOption.classList.add('selected');
            if (dateValue.year === today.getFullYear() && monthValue === today.getMonth() + 1) {
                monthOption.classList.add('today');
            }
            monthOption.addEventListener('click', function () {
                selectDateValue(prefix, 'month', monthValue);
            });
            monthGrid.appendChild(monthOption);
        });
        dropdown.appendChild(monthGrid);
    } else if (type === 'day') {
        const dayGrid = document.createElement('div');
        dayGrid.className = 'day-grid';
        const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        weekdays.forEach(day => {
            const dayHeader = document.createElement('div');
            dayHeader.className = 'day-header';
            dayHeader.textContent = day;
            dayGrid.appendChild(dayHeader);
        });

        const year = dateValue.year;
        const month = dateValue.month;
        const firstDay = new Date(year, month - 1, 1);
        const lastDay = new Date(year, month, 0);
        const daysInMonth = lastDay.getDate();
        const startDayOfWeek = firstDay.getDay();

        for (let i = 0; i < startDayOfWeek; i++) {
            dayGrid.appendChild(document.createElement('div'));
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dayOption = document.createElement('div');
            dayOption.className = 'date-option';
            dayOption.textContent = day;
            if (day === dateValue.day) dayOption.classList.add('selected');
            if (year === today.getFullYear() && month === today.getMonth() + 1 && day === today.getDate()) {
                dayOption.classList.add('today');
            }
            dayOption.addEventListener('click', function () {
                selectDateValue(prefix, 'day', day);
            });
            dayGrid.appendChild(dayOption);
        }
        dropdown.appendChild(dayGrid);
    }
}

function selectDateValue(prefix, type, value) {
    try {
        let dateValue;
        if (prefix === 'month') {
            dateValue = monthDateValue;
            dateValue[type] = value;
            updateDateDisplay('month');
            hideAllDropdowns();
            handleMonthPickerChange();
            return;
        } else {
            dateValue = prefix === 'start' ? startDateValue : endDateValue;
            dateValue[type] = value;
            if (type === 'year' || type === 'month') {
                const daysInMonth = new Date(dateValue.year, dateValue.month, 0).getDate();
                if (dateValue.day > daysInMonth) {
                    dateValue.day = daysInMonth;
                }
            }
            updateDateDisplay(prefix);
            hideAllDropdowns();
            updateDateRangeFromPickers();
        }
    } catch (error) {
        console.error('Failed to select date value:', error);
    }
}

async function updateDateRangeFromPickers() {
    try {
        const startDateStr = `${startDateValue.year}-${String(startDateValue.month).padStart(2, '0')}-${String(startDateValue.day).padStart(2, '0')}`;
        const endDateStr = `${endDateValue.year}-${String(endDateValue.month).padStart(2, '0')}-${String(endDateValue.day).padStart(2, '0')}`;

        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            console.error('Invalid date format');
            return;
        }

        if (startDate > endDate) {
            showError('Start date cannot be later than end date');
            return;
        }

        dateRange = {
            startDate: startDateStr,
            endDate: endDateStr
        };

        // 更新日历选择器
        calendarStartDate = new Date(startDateValue.year, startDateValue.month - 1, startDateValue.day);
        calendarStartDate.setHours(0, 0, 0, 0);
        calendarEndDate = new Date(endDateValue.year, endDateValue.month - 1, endDateValue.day);
        calendarEndDate.setHours(0, 0, 0, 0);

        // 重置上次请求参数，允许重新加载
        lastRequestParams = null;
        await loadData(true); // 立即执行
    } catch (error) {
        console.error('Failed to update date range:', error);
        showError('Failed to update date range');
    }
}

// 更新日期范围显示
function updateDateRangeDisplay() {
    const display = document.getElementById('date-range-display');
    if (!display) return;
    if (calendarStartDate && calendarEndDate) {
        const start = formatDateDisplay(calendarStartDate);
        const end = formatDateDisplay(calendarEndDate);
        display.textContent = `${start} - ${end}`;
    } else if (calendarStartDate) {
        const start = formatDateDisplay(calendarStartDate);
        display.textContent = `${start} - Select end date`;
    } else {
        display.textContent = 'Select date range';
    }
}

// 格式化日期显示
function formatDateDisplay(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${day}/${month}/${year}`;
}

// 格式化日期为 YYYY-MM-DD
function formatDateToYYYYMMDD(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 切换日历显示
function toggleCalendar() {
    const popup = document.getElementById('calendar-popup');
    const picker = document.getElementById('date-range-picker');
    if (!popup || !picker) return;

    if (popup.style.display === 'none' || !popup.style.display) {
        const rect = picker.getBoundingClientRect();
        popup.style.top = (rect.bottom + 8) + 'px';
        popup.style.left = rect.left + 'px';
        popup.style.display = 'block';
        initCalendar();
        renderCalendar();
    } else {
        popup.style.display = 'none';
    }
}

// 初始化日历
function initCalendar() {
    const today = new Date();
    if (!calendarStartDate) {
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1;
        const firstDayOfMonth = new Date(currentYear, currentMonth - 1, 1);
        const lastDayOfMonth = new Date(currentYear, currentMonth, 0);
        calendarStartDate = new Date(firstDayOfMonth);
        calendarStartDate.setHours(0, 0, 0, 0);
        calendarEndDate = new Date(currentYear, currentMonth - 1, lastDayOfMonth.getDate());
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
            if (year === calendarCurrentDate.getFullYear()) {
                option.selected = true;
            }
            yearSelect.appendChild(option);
        }
    }
    const monthSelect = document.getElementById('calendar-month-select');
    if (monthSelect) {
        monthSelect.value = calendarCurrentDate.getMonth();
    }
    updateDateRangeDisplay();
}

// 切换月份
function changeMonth(delta) {
    calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() + delta);
    const monthSelect = document.getElementById('calendar-month-select');
    const yearSelect = document.getElementById('calendar-year-select');
    if (monthSelect) monthSelect.value = calendarCurrentDate.getMonth();
    if (yearSelect) yearSelect.value = calendarCurrentDate.getFullYear();
    renderCalendar();
}

// 渲染日历
function renderCalendar() {
    const yearSelect = document.getElementById('calendar-year-select');
    const monthSelect = document.getElementById('calendar-month-select');
    if (!yearSelect || !monthSelect) return;

    const year = parseInt(yearSelect.value);
    const month = parseInt(monthSelect.value);
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
        const dayElement = createDayElement(day, year, month - 1, true);
        daysContainer.appendChild(dayElement);
    }
    for (let day = 1; day <= lastDate; day++) {
        const dayElement = createDayElement(day, year, month, false);
        daysContainer.appendChild(dayElement);
    }
    const totalCells = daysContainer.children.length;
    const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let day = 1; day <= remainingCells; day++) {
        const dayElement = createDayElement(day, year, month + 1, true);
        daysContainer.appendChild(dayElement);
    }
}

// 创建日期元素
function createDayElement(day, year, month, isOtherMonth) {
    const dayElement = document.createElement('div');
    dayElement.className = 'calendar-day';
    dayElement.textContent = day;
    const date = new Date(year, month, day);
    date.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (isOtherMonth) {
        dayElement.classList.add('other-month');
    }
    if (date.getTime() === today.getTime() && !isOtherMonth) {
        dayElement.classList.add('today');
    }
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
            if (currentTime === startTime) {
                dayElement.classList.add('start-date', 'selecting');
            }
        }
    }
    dayElement.addEventListener('click', (e) => {
        e.stopPropagation();
        selectDate(date);
    });
    dayElement.addEventListener('mouseenter', () => {
        if (isSelectingRange && calendarStartDate && !calendarEndDate) {
            highlightPreviewRange(date);
        }
    });
    return dayElement;
}

// 高亮预览范围
function highlightPreviewRange(hoverDate) {
    const days = document.querySelectorAll('.calendar-day');
    const startTime = calendarStartDate.getTime();
    const hoverTime = hoverDate.getTime();
    const yearSelect = document.getElementById('calendar-year-select');
    const monthSelect = document.getElementById('calendar-month-select');
    if (!yearSelect || !monthSelect) return;

    const year = parseInt(yearSelect.value);
    const month = parseInt(monthSelect.value);

    days.forEach(day => {
        day.classList.remove('preview-range', 'preview-end');
        const dayText = parseInt(day.textContent);
        if (!dayText) return;
        let dayDate;
        if (day.classList.contains('other-month')) {
            const firstDayOfMonth = new Date(year, month, 1);
            const firstDayWeek = firstDayOfMonth.getDay();
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
        if (dayTime > minTime && dayTime < maxTime) {
            day.classList.add('preview-range');
        } else if (dayTime === hoverTime && dayTime !== startTime) {
            day.classList.add('preview-end');
        }
    });
}

// 选择日期
async function selectDate(date) {
    if (!calendarStartDate || (calendarStartDate && calendarEndDate)) {
        calendarStartDate = new Date(date);
        calendarEndDate = null;
        isSelectingRange = true;
    } else {
        if (date < calendarStartDate) {
            calendarEndDate = calendarStartDate;
            calendarStartDate = new Date(date);
        } else {
            calendarEndDate = new Date(date);
        }
        isSelectingRange = false;
        await updateDateRange();
        const popup = document.getElementById('calendar-popup');
        if (popup) popup.style.display = 'none';
    }
    renderCalendar();
    updateDateRangeDisplay();
}

// 更新dateRange对象
async function updateDateRange() {
    if (calendarStartDate && calendarEndDate) {
        dateRange.startDate = formatDateToYYYYMMDD(calendarStartDate);
        dateRange.endDate = formatDateToYYYYMMDD(calendarEndDate);
        startDateValue = {
            year: calendarStartDate.getFullYear(),
            month: calendarStartDate.getMonth() + 1,
            day: calendarStartDate.getDate()
        };
        endDateValue = {
            year: calendarEndDate.getFullYear(),
            month: calendarEndDate.getMonth() + 1,
            day: calendarEndDate.getDate()
        };
        // 手动选择日期时，重置范围类型（按天显示）
        currentRangeType = null;
        updateDateDisplay('start');
        updateDateDisplay('end');
        lastRequestParams = null;
        if (dateRange.startDate && dateRange.endDate && isDashboardDataScopeValid()) {
            await loadData(true); // 立即执行
        }
    }
}

// 处理月份选择器变化
async function handleMonthPickerChange() {
    const year = monthDateValue.year;
    const month = monthDateValue.month;
    if (year && month) {
        // 选择了具体月份：按天显示
        currentRangeType = null;
        const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const lastDayFormatted = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        dateRange = { startDate: firstDay, endDate: lastDayFormatted };
        calendarStartDate = new Date(year, month - 1, 1);
        calendarStartDate.setHours(0, 0, 0, 0);
        calendarEndDate = new Date(year, month - 1, lastDay);
        calendarEndDate.setHours(0, 0, 0, 0);
        startDateValue = { year: year, month: month, day: 1 };
        endDateValue = { year: year, month: month, day: lastDay };
        updateDateDisplay('start');
        updateDateDisplay('end');
        updateDateRangeDisplay();
    } else if (year && !month) {
        // 只选择了年份：按月份显示
        currentRangeType = 'year';
        const firstDay = `${year}-01-01`;
        const lastDay = `${year}-12-31`;
        dateRange = { startDate: firstDay, endDate: lastDay };
        calendarStartDate = new Date(year, 0, 1);
        calendarStartDate.setHours(0, 0, 0, 0);
        calendarEndDate = new Date(year, 11, 31);
        calendarEndDate.setHours(0, 0, 0, 0);
        startDateValue = { year: year, month: 1, day: 1 };
        endDateValue = { year: year, month: 12, day: 31 };
        updateDateDisplay('start');
        updateDateDisplay('end');
        updateDateRangeDisplay();
    } else {
        return;
    }
    lastRequestParams = null;
    if (dateRange.startDate && dateRange.endDate && isDashboardDataScopeValid()) {
        await loadData(true); // 立即执行
    }
}

// 快速选择下拉菜单控制
function toggleQuickSelectDropdown() {
    const dropdown = document.getElementById('quick-select-dropdown');
    if (!dropdown) return;
    hideAllDropdowns();
    dropdown.classList.toggle('show');
}

// 快速选择时间范围
async function selectQuickRange(range) {
    const today = new Date();
    let startDate, endDate;
    switch (range) {
        case 'today':
            startDate = new Date(today);
            endDate = new Date(today);
            break;
        case 'yesterday':
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            startDate = yesterday;
            endDate = yesterday;
            break;
        case 'thisWeek':
            const thisWeekStart = new Date(today);
            const dayOfWeek = thisWeekStart.getDay();
            const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            thisWeekStart.setDate(thisWeekStart.getDate() - daysToMonday);
            startDate = thisWeekStart;
            endDate = new Date(today);
            break;
        case 'lastWeek':
            const lastWeekEnd = new Date(today);
            const lastWeekDayOfWeek = lastWeekEnd.getDay();
            const daysToLastSunday = lastWeekDayOfWeek === 0 ? 0 : lastWeekDayOfWeek;
            lastWeekEnd.setDate(lastWeekEnd.getDate() - daysToLastSunday - 1);
            const lastWeekStart = new Date(lastWeekEnd);
            lastWeekStart.setDate(lastWeekStart.getDate() - 6);
            startDate = lastWeekStart;
            endDate = lastWeekEnd;
            break;
        case 'thisMonth':
            startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            endDate = new Date(today);
            break;
        case 'lastMonth':
            const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
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
    const formatDate = (date) => {
        return date.getFullYear() + '-' +
            String(date.getMonth() + 1).padStart(2, '0') + '-' +
            String(date.getDate()).padStart(2, '0');
    };
    dateRange = {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate)
    };
    calendarStartDate = new Date(startDate);
    calendarStartDate.setHours(0, 0, 0, 0);
    calendarEndDate = new Date(endDate);
    calendarEndDate.setHours(0, 0, 0, 0);
    startDateValue = {
        year: startDate.getFullYear(),
        month: startDate.getMonth() + 1,
        day: startDate.getDate()
    };
    endDateValue = {
        year: endDate.getFullYear(),
        month: endDate.getMonth() + 1,
        day: endDate.getDate()
    };
    monthDateValue = { year: null, month: null };
    updateDateDisplay('start');
    updateDateDisplay('end');
    updateDateDisplay('month');
    updateDateRangeDisplay();
    const quickSelectText = document.getElementById('quick-select-text');
    const rangeTexts = {
        'today': 'Today',
        'yesterday': 'Yesterday',
        'thisWeek': 'This Week',
        'lastWeek': 'Last Week',
        'thisMonth': 'This Month',
        'lastMonth': 'Last Month',
        'thisYear': 'This Year',
        'lastYear': 'Last Year'
    };
    if (quickSelectText) quickSelectText.textContent = rangeTexts[range] || 'Period';

    // 设置范围类型：如果是年份范围，设置为 'year'
    currentRangeType = (range === 'thisYear' || range === 'lastYear') ? 'year' : null;

    const dropdown = document.getElementById('quick-select-dropdown');
    if (dropdown) dropdown.classList.remove('show');
    lastRequestParams = null;
    if (dateRange.startDate && dateRange.endDate && isDashboardDataScopeValid()) {
        await loadData(true); // 立即执行
    }
}

// 点击外部关闭日历和下拉菜单
document.addEventListener('click', function (e) {
    const calendar = document.getElementById('date-range-picker');
    const popup = document.getElementById('calendar-popup');
    if (calendar && popup && !calendar.contains(e.target) && !popup.contains(e.target)) {
        popup.style.display = 'none';
    }
    if (!e.target.closest('.dropdown')) {
        const quickDropdown = document.getElementById('quick-select-dropdown');
        if (quickDropdown) quickDropdown.classList.remove('show');
    }
});

// 防抖函数，避免频繁调用
let loadDataTimeout = null;
let isLoading = false; // 防止重复请求
let lastRequestParams = null; // 记录上次请求参数，避免重复请求相同数据
let dailyCardPointCache = new Map(); // key: company|currency|date

// 实际执行数据加载的函数
async function executeLoadData() {
    if (!dateRange.startDate || !dateRange.endDate) {
        return;
    }

    if (!isDashboardDataScopeValid()) {
        lastRequestParams = null;
        setLoadingState(false);
        clearDashboardForInvalidScope();
        return;
    }

    // Group-All 模式：不需要 window.companyId，只需要 selectedDashboardGroup
    if (!isDashboardGroupAllMode && !window.companyId) return;

    // 检查参数是否仍然有效
    const checkParams = buildCacheKey();
    if (lastRequestParams === checkParams) {
        return;
    }

    // 如果页面不可见，不执行请求
    if (!isPageVisible) {
        return;
    }

    isLoading = true;
    lastRequestParams = checkParams;
    setLoadingState(true);

    try {
        let data;
        if (isDashboardGroupAllMode && selectedDashboardGroup) {
            // 并行请求 group 旗下所有公司
            const groupCompanies = allOwnerCompanies.filter(c =>
                c.group_id && c.group_id.toUpperCase() === selectedDashboardGroup &&
                c.company_id && c.company_id.trim() !== ''
            );
            if (groupCompanies.length === 0) {
                throw new Error('No companies found in group');
            }
            const results = await Promise.all(
                groupCompanies.map(c => fetchDashboardForCompany(c.id))
            );
            const validResults = results.filter(d => d && validateData(d));
            if (validResults.length === 0) {
                throw new Error('No valid data returned for group companies');
            }
            data = mergeGroupData(validResults);
        } else {
            data = await fetchDashboardForCompany(window.companyId);
        }
        if (data) {
            if (validateData(data)) {
                updateDashboard(data);
            } else {
                throw new Error('Invalid data format');
            }
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error('请求超时');
            showError('Request timeout, please try again later');
        } else {
            console.error('API调用失败:', error);
            showError('Failed to load data: ' + (error.message || 'Unknown error'));
        }
        lastRequestParams = null;
    } finally {
        isLoading = false;
        setLoadingState(false);
    }
}

// 构建缓存 key
function buildCacheKey() {
    return JSON.stringify({
        date_from: dateRange.startDate,
        date_to: dateRange.endDate,
        company_id: isDashboardGroupAllMode ? ('ALL_' + selectedDashboardGroup) : window.companyId,
        currency: window.dashboardCurrency || ''
    });
}

// Compute the group-link multiplier for a given company + current view group.
//   e.g. VG (native IG) viewed under AP filter where IG→AP = 3% → returns 0.03.
//   Native-group views (company.group_id === selectedDashboardGroup) → returns 1.
function getLinkMultiplierForCompany(companyId, groupFilter) {
    if (!groupFilter || !Array.isArray(allOwnerCompanies)) return 1;
    const gf = String(groupFilter).toUpperCase();
    const row = allOwnerCompanies.find(c =>
        parseInt(c.id) === parseInt(companyId) &&
        c.group_id && c.group_id.toUpperCase() === gf
    );
    if (row && row.link_percentage !== undefined && row.link_percentage !== null) {
        const pct = parseFloat(row.link_percentage);
        if (!isNaN(pct) && pct >= 0) return pct / 100;
    }
    return 1;
}

// Attach the group-link multiplier to the dashboard payload WITHOUT touching the
// raw numbers. Profit / Expenses / Net Profit / Trend Chart stay equal to the
// company's real figures (same as its native-group view). Only the Earnings
// card consumes `_link_multiplier` to apply the link percentage.
function scaleDashboardData(data, mul) {
    if (!data) return data;
    if (mul !== 1 && mul !== null && mul !== undefined) {
        data._link_multiplier = mul;
    }
    return data;
}

// 对单个 company 发起 Dashboard API 请求
async function fetchDashboardForCompany(companyId) {
    const queryParams = new URLSearchParams({
        date_from: dateRange.startDate,
        date_to: dateRange.endDate,
        company_id: companyId
    });
    if (window.dashboardCurrency) {
        queryParams.append('currency', window.dashboardCurrency);
    }
    // Let the backend pick the right company_ownership group-equity row when a
    // company has been split across multiple groups (e.g. 95 → IG 30% + AP 1%).
    if (selectedDashboardGroup) {
        queryParams.append('view_group', selectedDashboardGroup);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(buildApiUrl(`${API_BASE_URL}?${queryParams}`), {
        signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
    }
    const result = await response.json();
    if (result.success && result.data) {
        const multiplier = getLinkMultiplierForCompany(companyId, selectedDashboardGroup);
        return scaleDashboardData(result.data, multiplier);
    }
    throw new Error(result.message || 'Failed to load data');
}

// 合并多个公司的 Dashboard 数据
function mergeGroupData(dataList) {
    let capital = 0, expenses = 0, profit = 0;
    let periodCapital = 0, periodExpenses = 0, periodProfit = 0;
    let bfCapital = 0, bfExpenses = 0, bfProfit = 0;
    const dailyCapital = {}, dailyExpenses = {}, dailyProfit = {}, dailyProfitFlow = {};
    let hasOwnershipSetup = false;

    // 收集每家公司的 NET PROFIT 和 ownership_percentage，用于加权平均
    const companyEarnings = [];

    dataList.forEach(d => {
        capital += parseFloat(d.capital || 0);
        expenses += parseFloat(d.expenses || 0);
        profit += parseFloat(d.profit || 0);

        if (d.period_total) {
            periodCapital += parseFloat(d.period_total.capital || 0);
            periodExpenses += parseFloat(d.period_total.expenses || 0);
            periodProfit += parseFloat(d.period_total.profit || 0);
        }
        if (d.initial_balance) {
            bfCapital += parseFloat(d.initial_balance.capital || 0);
            bfExpenses += parseFloat(d.initial_balance.expenses || 0);
            bfProfit += parseFloat(d.initial_balance.profit || 0);
        }
        if (d.daily_data) {
            mergeDailyMap(dailyCapital, d.daily_data.capital);
            mergeDailyMap(dailyExpenses, d.daily_data.expenses);
            mergeDailyMap(dailyProfit, d.daily_data.profit);
            mergeDailyMap(dailyProfitFlow, d.daily_data.profit_payment_flow_daily);
        }
        if (d.has_ownership_setup) {
            hasOwnershipSetup = true;
        }

        // 收集各公司的 Earnings 信息
        const pct = parseFloat(d.ownership_percentage || 0);
        const grpPct = parseFloat(d.group_equity_percentage || 0);
        const grpAccPct = parseFloat(d.group_account_percentage || 0);
        const hasGrp = !!d.has_group_ownership;
        const rawP = parseFloat(d?.period_total?.profit ?? d.profit) || 0;
        const rawE = parseFloat(d?.period_total?.expenses ?? d.expenses) || 0;
        const displayE = rawE > 0 ? -rawE : rawE;
        const netProfit = rawP + displayE;
        // Group All mode — same priority cascade as updateDashboard's single-company path.
        const linkMul = parseFloat(d._link_multiplier);
        const hasLink = !isNaN(linkMul) && linkMul > 0 && linkMul !== 1;
        const directPct = pct / 100;
        let effectivePct;
        if (hasLink) {
            const viewerGroupShare = grpAccPct > 0 ? grpAccPct / 100 : 1;
            effectivePct = linkMul * viewerGroupShare;
        } else if (directPct > 0) {
            effectivePct = directPct;
        } else {
            const chainPct = hasGrp ? (grpPct / 100) * (grpAccPct / 100) : 0;
            effectivePct = chainPct === 0 ? 1 : chainPct;
        }
        const earningsVal = netProfit * effectivePct;
        hasOwnershipSetup = true;
        companyEarnings.push({ netProfit, pct, grpPct, grpAccPct, hasGrp, earnings: earningsVal });
    });

    // 合计 Earnings = 各公司的 NET PROFIT × 各自 ownership_percentage 之和
    const totalEarnings = companyEarnings.reduce((sum, c) => sum + c.earnings, 0);

    // 计算合并后的整体 NET PROFIT
    const mergedRawProfit = periodProfit;
    const mergedRawExpenses = periodExpenses;
    const mergedDisplayExpenses = mergedRawExpenses > 0 ? -mergedRawExpenses : mergedRawExpenses;
    const mergedNetProfit = mergedRawProfit + mergedDisplayExpenses;

    // 反推等效 ownership_percentage：Earnings = NET_PROFIT × (pct/100)
    // → pct = (totalEarnings / mergedNetProfit) * 100
    let effectiveOwnershipPct = 0;
    if (mergedNetProfit !== 0) {
        effectiveOwnershipPct = (totalEarnings / mergedNetProfit) * 100;
    } else if (companyEarnings.length > 0) {
        // NET PROFIT 为 0 时，取各公司 ownership_percentage 的平均值
        const totalPct = companyEarnings.reduce((sum, c) => sum + c.pct, 0);
        effectiveOwnershipPct = totalPct / companyEarnings.length;
    }

    return {
        capital, expenses, profit,
        period_total: { capital: periodCapital, expenses: periodExpenses, profit: periodProfit },
        initial_balance: { capital: bfCapital, expenses: bfExpenses, profit: bfProfit },
        daily_data: {
            capital: dailyCapital,
            expenses: dailyExpenses,
            profit: dailyProfit,
            profit_payment_flow_daily: dailyProfitFlow
        },
        date_range: dataList[0]?.date_range || { from: dateRange.startDate, to: dateRange.endDate },
        ownership_percentage: effectiveOwnershipPct,
        has_ownership_setup: hasOwnershipSetup
    };
}

// 按日期累加 daily_data 的辅助函数
function mergeDailyMap(target, source) {
    if (!source || typeof source !== 'object') return;
    Object.keys(source).forEach(date => {
        target[date] = (target[date] || 0) + parseFloat(source[date] || 0);
    });
}

async function loadData(immediate = false) {
    // 清除之前的定时器
    if (loadDataTimeout) {
        clearTimeout(loadDataTimeout);
        loadDataTimeout = null;
    }

    if (!isDashboardDataScopeValid()) {
        lastRequestParams = null;
        clearDashboardForInvalidScope();
        return Promise.resolve();
    }

    // 如果正在加载，直接返回
    if (isLoading) {
        return Promise.resolve();
    }

    // 检查是否与上次请求参数相同（含 group）
    const currentParams = buildCacheKey();
    if (lastRequestParams === currentParams) {
        return Promise.resolve();
    }

    // 如果立即执行，跳过防抖
    if (immediate) {
        return executeLoadData();
    }

    // 使用防抖，延迟 300ms 执行（仅在非立即模式下）
    return new Promise((resolve) => {
        loadDataTimeout = setTimeout(async () => {
            await executeLoadData();
            resolve();
        }, 300);
    });
}

// 验证数据格式
function validateData(data) {
    try {
        if (!data || typeof data !== 'object') return false;
        if (typeof data.capital !== 'number' && typeof data.capital !== 'string') return false;
        if (typeof data.expenses !== 'number' && typeof data.expenses !== 'string') return false;
        if (typeof data.profit !== 'number' && typeof data.profit !== 'string') return false;
        if (!data.daily_data || typeof data.daily_data !== 'object') return false;
        if (!data.date_range || !data.date_range.from || !data.date_range.to) return false;
        return true;
    } catch (e) {
        return false;
    }
}

// 设置加载状态
function setLoadingState(loading) {
    const chartDateRange = document.getElementById('chart-date-range');
    if (!chartDateRange) return;
    if (loading) {
        // 正在加载时，销毁旧图表，避免用户看到旧数据
        if (trendChart) {
            trendChart.destroy();
            trendChart = null;
        }
        chartDateRange.textContent = 'Loading data...';
        chartDateRange.style.color = '#6b7280';
    } else {
        // 加载结束：显示当前日期范围，避免一直显示 Loading data...
        if (dateRange && dateRange.startDate && dateRange.endDate) {
            chartDateRange.textContent = `${formatDateForDisplay(dateRange.startDate)} to ${formatDateForDisplay(dateRange.endDate)}`;
        } else {
            chartDateRange.textContent = 'No data';
        }
        chartDateRange.style.color = '#6b7280';
    }
}

// 显示错误信息
function showError(message) {
    const chartDateRange = document.getElementById('chart-date-range');
    if (chartDateRange) {
        chartDateRange.textContent = '❌ ' + message;
        chartDateRange.style.color = '#ef4444';
    }

    // 3秒后恢复
    setTimeout(() => {
        if (chartDateRange && chartDateRange.textContent.includes('❌')) {
            chartDateRange.textContent = 'Data loading failed, please refresh the page';
            chartDateRange.style.color = '#6b7280';
        }
    }, 3000);
}

function showDashboardAlertModal(title, message) {
    return new Promise(resolve => {
        const overlay = document.getElementById('dashboardAlertModalOverlay');
        const titleEl = document.getElementById('dashboardAlertModalTitle');
        const messageEl = document.getElementById('dashboardAlertModalMessage');
        const confirmBtn = document.getElementById('dashboardAlertModalConfirmBtn');

        if (!overlay || !titleEl || !messageEl || !confirmBtn) {
            alert(message || 'Company access denied.');
            resolve();
            return;
        }

        titleEl.textContent = title || 'Notice';
        messageEl.textContent = message || '';
        overlay.classList.add('is-open');
        overlay.setAttribute('aria-hidden', 'false');

        function close() {
            overlay.classList.remove('is-open');
            overlay.setAttribute('aria-hidden', 'true');
            confirmBtn.removeEventListener('click', onConfirm);
            overlay.removeEventListener('click', onOverlayClick);
            document.removeEventListener('keydown', onEscape);
            resolve();
        }

        function onConfirm() { close(); }
        function onOverlayClick(e) {
            if (e.target === overlay) close();
        }
        function onEscape(e) {
            if (e.key === 'Escape') close();
        }

        confirmBtn.addEventListener('click', onConfirm);
        overlay.addEventListener('click', onOverlayClick);
        document.addEventListener('keydown', onEscape);
    });
}

function shouldShowCompanyAccessModal(message, reason) {
    const normalizedReason = String(reason || '').toLowerCase();
    if (normalizedReason === 'expired' || normalizedReason === 'no_set') {
        return true;
    }

    const msg = String(message || '').toLowerCase();
    if (!msg) return false;
    // 仅在「已到期 / 未续期(未设置到期日)」场景弹窗
    return (
        msg.includes('company has expired') ||
        msg.includes('group has expired') ||
        msg.includes('company expiration date is not set') ||
        msg.includes('date is not set')
    );
}

function getCompanyAccessModalMessage(reason, fallbackMessage) {
    const normalizedReason = String(reason || '').toLowerCase();
    if (normalizedReason === 'expired') {
        return 'This company since login has expired. Please contact the Customer Service.';
    }
    if (normalizedReason === 'no_set') {
        return 'Please contact the Customer Service to set the expiration date.';
    }

    const msg = String(fallbackMessage || '').toLowerCase();
    if (msg.includes('date is not set') || msg.includes('not set')) {
        return 'Please contact the Customer Service to set the expiration date.';
    }
    if (msg.includes('expired') || msg.includes('expiration')) {
        return 'This company since login has expired. Please contact the Customer Service';
    }
    return 'Cannot switch to this company due to company access restriction.';
}

function updateDashboard(data) {
    try {
        // 单次 requestAnimationFrame 批量更新 DOM 与图表，减少一帧延迟
        requestAnimationFrame(() => {
            try {
                const capitalEl = document.getElementById('capital-value');
                const expensesEl = document.getElementById('expenses-value');
                const profitEl = document.getElementById('profit-value');
                const earningsEl = document.getElementById('earnings-value');

                // 原始值（跟 Payment 一致）
                const rawProfit = parseFloat(data?.period_total?.profit ?? data.profit) || 0
                const rawExpenses = parseFloat(data?.period_total?.expenses ?? data.expenses) || 0;

                // Dashboard 卡片口径：Profit 以正数显示（与业务展示预期一致）。
                const displayProfitNum = rawProfit;

                // Expenses 卡片：Payment 为正数时，Dashboard 用负数显示支出；如果本身是负数则保持
                const displayExpensesNum = rawExpenses > 0 ? -rawExpenses : rawExpenses;

                // NET PROFIT 卡片：沿用「显示值」计算
                // 规则：NET PROFIT = Profit(显示) + Expenses(显示)
                const netProfitDisplay = displayProfitNum + displayExpensesNum;

                // Earnings 卡片：
                //   Under a group filter:  Earnings = Net Profit × account_ownership% × group_earnings_link%
                //     - account_ownership% = this company's equity going to its group
                //       (from company_ownership owner_type='group'). Defaults to 100% if
                //       the company has no explicit group_equity row.
                //     - group_earnings_link% = IG→AP style link (already applied to
                //       netProfitDisplay by scaleDashboardData). Nothing extra to do here.
                //   Without a group filter: legacy per-user formula stays.
                const ownershipPercentage = parseFloat(data?.ownership_percentage) || 0;
                const groupEquityPercentage = parseFloat(data?.group_equity_percentage) || 0;
                const groupAccountPercentage = parseFloat(data?.group_account_percentage) || 0;
                const hasGroupOwnership = !!data?.has_group_ownership;
                const linkMul = parseFloat(data?._link_multiplier);
                const hasLinkOwnership = !isNaN(linkMul) && linkMul > 0 && linkMul !== 1;
                const inGroupView = !!selectedDashboardGroup;

                // Earnings priority cascade. The key split: when a company appears
                // via a group-link (virtual row under a non-native group), Earnings
                // only reflects the link chain — NOT the viewer's direct owner %
                // (which belongs to the native-group view).
                //
                //   hasLinkOwnership (viewing through a link):
                //     → Net Profit × link_multiplier × viewer_group_share
                //       where viewer_group_share = group_account_percentage if set
                //       (partnership / external owner), else 100% (self-owned group).
                //
                //   native (no link):
                //     → 有直接股权时只用 direct%（避免与 group 链重复，如 JK 90%）
                //     → 否则：Net Profit × (group_equity% × group_account%)（含多段链由 API 合入 equity%）
                //     → 无配置时在 group 视图可回退 100%（admin）
                const directPct = ownershipPercentage / 100;
                let effectivePct;
                if (hasLinkOwnership) {
                    const viewerGroupShare = groupAccountPercentage > 0
                        ? groupAccountPercentage / 100
                        : 1;
                    effectivePct = linkMul * viewerGroupShare;
                } else if (directPct > 0) {
                    effectivePct = directPct;
                } else if (hasGroupOwnership) {
                    const chainPct = (groupEquityPercentage / 100) * (groupAccountPercentage / 100);
                    effectivePct = chainPct;
                } else {
                    effectivePct = (directPct === 0 && inGroupView) ? 1 : 0;
                }
                const earningsDisplay = netProfitDisplay * effectivePct;

                // 记录卡片显示值，供图表 tooltip 统一读取，避免口径不一致
                chartMetadata.cardProfitDisplay = displayProfitNum;
                chartMetadata.cardExpensesDisplay = displayExpensesNum;

                if (capitalEl) capitalEl.textContent = formatCurrency(displayProfitNum);
                if (expensesEl) expensesEl.textContent = formatCurrency(displayExpensesNum);
                if (profitEl) profitEl.textContent = formatCurrency(netProfitDisplay);
                if (earningsEl) {
                    earningsEl.textContent = formatCurrency(earningsDisplay);
                    const earningsCard = document.getElementById('earnings-card-wrapper');
                    if (earningsCard) {
                        const showEarnings = !!data?.has_ownership_setup || hasLinkOwnership || inGroupView;
                        earningsCard.style.display = showEarnings ? 'flex' : 'none';
                        // Toggle top-row layout: 3-column grid when Earnings visible, full-width when hidden
                        const topRow = earningsCard.closest('.dashboard-top-row');
                        if (topRow) {
                            topRow.classList.toggle('has-earnings', showEarnings);
                        }
                    }
                }
                const chartDateRangeEl = document.getElementById('chart-date-range');
                if (chartDateRangeEl && data.date_range) {
                    chartDateRangeEl.textContent =
                        `${formatDateForDisplay(data.date_range.from)} to ${formatDateForDisplay(data.date_range.to)}`;
                    chartDateRangeEl.style.color = '#6b7280';
                }
                Promise.resolve(updateChart(data)).catch((chartError) => {
                    console.error('更新图表失败:', chartError);
                    showError('Chart update failed');
                });
            } catch (domError) {
                console.error('更新DOM失败:', domError);
                showError('UI update failed');
            }
        });
    } catch (error) {
        console.error('updateDashboard 错误:', error);
        showError('Data update failed');
    }
}

async function fetchCardPointByDate(dateStr) {
    const cacheKey = `${window.companyId || ''}|${window.dashboardCurrency || ''}|${dateStr}`;
    if (dailyCardPointCache.has(cacheKey)) {
        return dailyCardPointCache.get(cacheKey);
    }

    const queryParams = new URLSearchParams({
        date_from: dateStr,
        date_to: dateStr,
        company_id: window.companyId
    });
    if (window.dashboardCurrency) {
        queryParams.append('currency', window.dashboardCurrency);
    }

    const response = await fetch(buildApiUrl(`${API_BASE_URL}?${queryParams}`));
    if (!response.ok) {
        throw new Error(`Daily point request failed: ${response.status}`);
    }
    const result = await response.json();
    if (!result.success || !result.data) {
        throw new Error(result.message || 'Daily point payload invalid');
    }

    // 单日点位必须使用「当日发生额」口径（period_total），避免把 B/F(initial_balance) 或累计余额带进趋势图
    // Raw numbers intentionally match the company's own data (no link scaling on KPIs).
    const rawProfit = parseFloat(result.data?.period_total?.profit ?? result.data.profit) || 0;
    const rawExpenses = parseFloat(result.data?.period_total?.expenses ?? result.data.expenses) || 0;
    const point = {
        profit: rawProfit,
        expenses: rawExpenses > 0 ? -rawExpenses : rawExpenses
    };
    dailyCardPointCache.set(cacheKey, point);
    return point;
}

function formatCurrency(value) {
    return parseFloat(value || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatDateForDisplay(dateString) {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${day}/${month}/${year}`;
}

async function updateChart(data) {
    const chartCanvas = document.getElementById('trend-chart');
    if (!chartCanvas) {
        console.error('图表canvas元素不存在');
        showError('Chart element not found');
        return;
    }

    // 验证数据
    if (!data) {
        console.error('图表数据为空', data);
        showError('Chart data is empty');
        // 即使没有数据，也显示空图表
        if (trendChart) {
            trendChart.destroy();
            trendChart = null;
        }
        return;
    }

    if (!data.daily_data) {
        console.warn('daily_data 不存在，使用空对象', data);
        data.daily_data = {};
    }

    const dailyData = data.daily_data;
    console.log('dailyData:', dailyData);

    // 确保 capital、expenses 和 profit 存在
    if (!dailyData.capital) {
        console.warn('缺少 capital 数据，使用空对象');
        dailyData.capital = {};
    }
    if (!dailyData.expenses) {
        console.warn('缺少 expenses 数据，使用空对象');
        dailyData.expenses = {};
    }
    if (!dailyData.profit) {
        console.warn('缺少 profit 数据，使用空对象');
        dailyData.profit = {};
    }
    const strictProfitDailyFlow = (dailyData.profit_payment_flow_daily && typeof dailyData.profit_payment_flow_daily === 'object')
        ? dailyData.profit_payment_flow_daily
        : null;
    // 准备图表数据
    const dates = [];
    const capitalData = [];
    const expensesData = [];
    const profitData = [];
    const netProfitData = [];
    const earningsData = [];
    const ownershipPercentage = parseFloat(data?.ownership_percentage) || 0;
    const groupEquityPercentage = parseFloat(data?.group_equity_percentage) || 0;
    const groupAccountPercentage = parseFloat(data?.group_account_percentage) || 0;
    const hasGroupOwnership = !!data?.has_group_ownership;
    const directPct = ownershipPercentage / 100;
    // 有直接股权时只乘 direct；否则 group_equity×group_account（多段链已并入 equity）
    const earningsMultiplier = directPct > 0
        ? directPct
        : (hasGroupOwnership
            ? (groupEquityPercentage / 100) * (groupAccountPercentage / 100)
            : 0);

    // 初始化累计值（从 API 返回的 initial_balance 开始）
    // initial_balance 是起始日期之前的余额总和（B/F）
    const initialBalance = {
        capital: data.initial_balance ? parseFloat(data.initial_balance.capital || 0) : 0,
        expenses: data.initial_balance ? parseFloat(data.initial_balance.expenses || 0) : 0,
        profit: data.initial_balance ? parseFloat(data.initial_balance.profit || 0) : 0
    };
    let currentCapital = initialBalance.capital;
    let currentExpenses = initialBalance.expenses;
    let currentProfit = initialBalance.profit;

    // 检查是否应按月份聚合（年份范围或跨越多个月）
    if (shouldAggregateByMonth() && dateRange.startDate && dateRange.endDate) {
        // 按月份聚合数据
        const startDate = new Date(dateRange.startDate);
        const endDate = new Date(dateRange.endDate);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(0, 0, 0, 0);

        // 生成所有月份
        const months = [];
        const currentMonth = new Date(startDate);
        while (currentMonth <= endDate) {
            const year = currentMonth.getFullYear();
            const month = currentMonth.getMonth() + 1;
            const monthKey = `${year}-${String(month).padStart(2, '0')}`;
            months.push({ year, month, monthKey });
            currentMonth.setMonth(currentMonth.getMonth() + 1);
        }

        // 为每个月聚合数据
        months.forEach(({ year, month, monthKey }) => {
            let monthCapital = 0;
            let monthExpenses = 0;
            let monthProfit = 0;

            // 遍历该月的所有日期
            const firstDay = new Date(year, month - 1, 1);
            const lastDay = new Date(year, month, 0);

            for (let day = 1; day <= lastDay.getDate(); day++) {
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dateObj = new Date(dateStr);
                if (dateObj >= startDate && dateObj <= endDate) {
                    const profitDelta = parseFloat(dailyData.profit && dailyData.profit[dateStr] ? dailyData.profit[dateStr] : 0) || 0;
                    const expensesDelta = parseFloat(dailyData.expenses && dailyData.expenses[dateStr] ? dailyData.expenses[dateStr] : 0) || 0;
                    const capitalDelta = parseFloat(dailyData.capital && dailyData.capital[dateStr] ? dailyData.capital[dateStr] : 0) || 0;

                    const hasStrictProfitDelta = strictProfitDailyFlow
                        && Object.prototype.hasOwnProperty.call(strictProfitDailyFlow, dateStr)
                    const strictProfitDelta = hasStrictProfitDelta
                        ? (parseFloat(strictProfitDailyFlow[dateStr]) || 0)
                        : profitDelta
                    monthProfit += strictProfitDelta;
                    monthExpenses += (expensesDelta > 0 ? -expensesDelta : expensesDelta);
                    monthCapital += capitalDelta;
                }
            }

            dates.push(monthKey);
            // 月聚合视图也按「发生额」显示（当月净发生），不做累计
            capitalData.push(monthCapital);
            expensesData.push(monthExpenses);
            profitData.push(monthProfit);
            
            const monthNetProfit = monthProfit + monthExpenses;
            netProfitData.push(monthNetProfit);
            earningsData.push(monthNetProfit * earningsMultiplier);
        });
    } else {
        // 非年份范围：按天显示
        const allDatesInRange = [];
        if (dateRange.startDate && dateRange.endDate) {
            const startDate = new Date(dateRange.startDate);
            const endDate = new Date(dateRange.endDate);
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(0, 0, 0, 0);

            const currentDate = new Date(startDate);
            while (currentDate <= endDate) {
                const dateStr = formatDateToYYYYMMDD(currentDate);
                allDatesInRange.push(dateStr);
                currentDate.setDate(currentDate.getDate() + 1);
            }
        }

        // 如果没有日期范围，使用API返回的日期（向后兼容）
        const allSortedDates = allDatesInRange.length > 0 ? allDatesInRange : [];
        if (allSortedDates.length === 0) {
            // 如果没有日期范围，尝试从API数据中获取日期
            const allDates = new Set();
            if (dailyData.capital && typeof dailyData.capital === 'object') {
                Object.keys(dailyData.capital).forEach(date => allDates.add(date));
            }
            if (dailyData.expenses && typeof dailyData.expenses === 'object') {
                Object.keys(dailyData.expenses).forEach(date => allDates.add(date));
            }
            if (dailyData.profit && typeof dailyData.profit === 'object') {
                Object.keys(dailyData.profit).forEach(date => allDates.add(date));
            }
            allSortedDates.push(...Array.from(allDates).sort());
        }

        if (allSortedDates.length === 0) {
            // 如果没有数据，显示空图表
            console.warn('没有图表数据，显示空图表');

            // 清空元数据
            chartMetadata = {
                sortedDates: [],
                capitalData: [],
                expensesData: [],
                profitData: [],
                netProfitData: [],
                earningsData: []
            };
            if (trendChart) {
                trendChart.destroy();
                trendChart = null;
            }
            // 创建空图表
            const emptyChartData = {
                labels: [],
                datasets: []
            };
            createChart(chartCanvas, emptyChartData);

            // 更新日期范围显示
            const chartDateRangeEl = document.getElementById('chart-date-range');
            if (chartDateRangeEl && data.date_range) {
                chartDateRangeEl.textContent =
                    `${formatDateForDisplay(data.date_range.from)} to ${formatDateForDisplay(data.date_range.to)} (No data in this date range)`;
                chartDateRangeEl.style.color = '#9ca3af';
            } else if (chartDateRangeEl) {
                chartDateRangeEl.textContent = 'No data in this date range';
                chartDateRangeEl.style.color = '#9ca3af';
            }
            return;
        }

        // 为范围内的每一天准备数据，没有数据的日期默认为0
        allSortedDates.forEach(date => {
            try {
                dates.push(date);

                // 使用 profit 和 expenses 角色，与仪表盘卡片逻辑一致
                const profitDelta = parseFloat(dailyData.profit && dailyData.profit[date] ? dailyData.profit[date] : 0) || 0;
                const expensesDelta = parseFloat(dailyData.expenses && dailyData.expenses[date] ? dailyData.expenses[date] : 0) || 0;

                // 按天图表显示“当日增量”，无数据日为 0（不做累计）
                const displayProfit = profitDelta;
                const displayExpenses = (expensesDelta > 0 ? -expensesDelta : expensesDelta);
                profitData.push(displayProfit);
                expensesData.push(displayExpenses);
                
                const netProfit = displayProfit + displayExpenses;
                netProfitData.push(netProfit);
                earningsData.push(netProfit * earningsMultiplier);

                // 如果需要 capital 数据（虽然当前图表不显示），也可以累计
                const capitalDelta = parseFloat(dailyData.capital && dailyData.capital[date] ? dailyData.capital[date] : 0) || 0;
                capitalData.push(capitalDelta);
            } catch (e) {
                console.warn('Error processing date data:', date, e);
                profitData.push(0);
                expensesData.push(0);
                capitalData.push(0);
            }
        });
    }

    // sortedDates 始终与 dates 对应，用于 tooltip / 坐标轴刻度
    const sortedDates = dates;

    // 存储元数据到外部变量（用于 tooltip）
    chartMetadata = {
        sortedDates: sortedDates,
        capitalData: capitalData,
        expensesData: expensesData,
        profitData: profitData,
        netProfitData: netProfitData,
        earningsData: earningsData
    };

    // 显示所有四条线数据集
    const allDatasets = [
        {
            label: 'Profit',
            data: profitData,
            borderColor: '#3b82f6',
            backgroundColor: function (context) {
                const chart = context.chart;
                const { ctx, chartArea } = chart;
                if (!chartArea) {
                    return null;
                }
                const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                gradient.addColorStop(0, 'rgba(59, 130, 246, 0.4)');
                gradient.addColorStop(0.3, 'rgba(59, 130, 246, 0.2)');
                gradient.addColorStop(0.7, 'rgba(59, 130, 246, 0.1)');
                gradient.addColorStop(1, 'rgba(59, 130, 246, 0.02)');
                return gradient;
            },
            fill: true,
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 8,
            dataType: 'profit'
        },
        {
            label: 'Expenses',
            data: expensesData,
            borderColor: '#ef4444',
            backgroundColor: function (context) {
                const chart = context.chart;
                const { ctx, chartArea } = chart;
                if (!chartArea) {
                    return null;
                }
                const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                gradient.addColorStop(0, 'rgba(239, 68, 68, 0.4)');
                gradient.addColorStop(0.3, 'rgba(239, 68, 68, 0.2)');
                gradient.addColorStop(0.7, 'rgba(239, 68, 68, 0.1)');
                gradient.addColorStop(1, 'rgba(239, 68, 68, 0.02)');
                return gradient;
            },
            fill: true,
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 8,
            dataType: 'expenses'
        },
        {
            label: 'NET PROFIT',
            data: netProfitData,
            borderColor: '#10b981',
            backgroundColor: function (context) {
                const chart = context.chart;
                const { ctx, chartArea } = chart;
                if (!chartArea) return null;
                const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                gradient.addColorStop(0, 'rgba(16, 185, 129, 0.4)');
                gradient.addColorStop(0.3, 'rgba(16, 185, 129, 0.2)');
                gradient.addColorStop(0.7, 'rgba(16, 185, 129, 0.1)');
                gradient.addColorStop(1, 'rgba(16, 185, 129, 0.02)');
                return gradient;
            },
            fill: true,
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 8,
            dataType: 'net_profit'
        },
        {
            label: 'Earnings',
            data: earningsData,
            borderColor: '#f59e0b',
            backgroundColor: function (context) {
                const chart = context.chart;
                const { ctx, chartArea } = chart;
                if (!chartArea) return null;
                const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                gradient.addColorStop(0, 'rgba(245, 158, 11, 0.4)');
                gradient.addColorStop(0.3, 'rgba(245, 158, 11, 0.2)');
                gradient.addColorStop(0.7, 'rgba(245, 158, 11, 0.1)');
                gradient.addColorStop(1, 'rgba(245, 158, 11, 0.02)');
                return gradient;
            },
            fill: true,
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 8,
            dataType: 'earnings'
        }
    ];

    // 根据按钮状态判断是否隐藏
    document.querySelectorAll('.chart-toggle-btn').forEach(btn => {
        const datasetIndex = parseInt(btn.dataset.dataset);
        if (allDatasets[datasetIndex]) {
            allDatasets[datasetIndex].hidden = !btn.classList.contains('active');
        }
    });

    // 默认显示所有数据集
    let filteredDatasets = allDatasets;

    const chartData = {
        labels: dates.map(d => {
            try {
                // 按月份聚合时（年份范围或跨越多个月），d 是 "YYYY-MM" 格式
                if (shouldAggregateByMonth() && d.match(/^\d{4}-\d{2}$/)) {
                    const [year, month] = d.split('-');
                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    return monthNames[parseInt(month, 10) - 1];
                }
                // 否则是日期格式 "YYYY-MM-DD"
                const date = new Date(d);
                if (isNaN(date.getTime())) return d;
                // 显示为 "DD/MM"
                return `${date.getDate()}/${date.getMonth() + 1}`;
            } catch (e) {
                return d;
            }
        }),
        datasets: filteredDatasets
    };

    // 如果图表已存在，销毁并重新创建（参考 kpi.php 的实现）
    if (trendChart) {
        trendChart.destroy();
        trendChart = null;
    }

    // 创建新图表
    createChart(chartCanvas, chartData);
    // 非按月聚合范围：先渲染，再异步用"按日卡片口径"覆盖，避免首屏空白
    // Group 模式下跳过此步骤（数据已是多公司聚合，单公司 card point 会破坏数据）
    if (!shouldAggregateByMonth() && dates.length > 0 && !selectedDashboardGroup) {
        const requestKeyAtStart = JSON.stringify({
            date_from: dateRange.startDate,
            date_to: dateRange.endDate,
            company_id: window.companyId,
            currency: window.dashboardCurrency || ''
        });
        // 只请求关键日期（有变动的日期 + 首尾日期）
        const datesSet = new Set(dates);
        const keyDatesSet = new Set();
        if (dailyData.capital && typeof dailyData.capital === 'object') {
            Object.keys(dailyData.capital).forEach((d) => {
                if (datesSet.has(d)) keyDatesSet.add(d);
            });
        }
        if (dailyData.expenses && typeof dailyData.expenses === 'object') {
            Object.keys(dailyData.expenses).forEach((d) => {
                if (datesSet.has(d)) keyDatesSet.add(d);
            });
        }
        if (dailyData.profit && typeof dailyData.profit === 'object') {
            Object.keys(dailyData.profit).forEach((d) => {
                if (datesSet.has(d)) keyDatesSet.add(d);
            });
        }
        keyDatesSet.add(dates[0]);
        keyDatesSet.add(dates[dates.length - 1]);
        const keyDates = Array.from(keyDatesSet).sort();

        Promise.allSettled(keyDates.map((d) => fetchCardPointByDate(d)))
            .then((results) => {
                const requestKeyNow = JSON.stringify({
                    date_from: dateRange.startDate,
                    date_to: dateRange.endDate,
                    company_id: window.companyId,
                    currency: window.dashboardCurrency || ''
                });
                if (requestKeyNow !== requestKeyAtStart) return;

                const pointMap = new Map();
                let appliedCount = 0;
                for (let i = 0; i < results.length; i++) {
                    const item = results[i];
                    if (item.status === 'fulfilled' && item.value) {
                        pointMap.set(keyDates[i], item.value);
                        appliedCount++;
                    }
                }

                // 仅覆盖命中的日期，未命中日期保持原本的按日值（通常为 0）
                for (let i = 0; i < dates.length; i++) {
                    const dateKey = dates[i];
                    if (pointMap.has(dateKey)) {
                        const p = pointMap.get(dateKey);
                        profitData[i] = parseFloat(p.profit || 0) || 0;
                        expensesData[i] = parseFloat(p.expenses || 0) || 0;
                        netProfitData[i] = profitData[i] + expensesData[i];
                        earningsData[i] = netProfitData[i] * (ownershipPercentage / 100);
                    }
                }

                chartMetadata.profitData = profitData;
                chartMetadata.expensesData = expensesData;
                chartMetadata.netProfitData = netProfitData;
                chartMetadata.earningsData = earningsData;

                if (trendChart && trendChart.data && trendChart.data.datasets && trendChart.data.datasets.length >= 4) {
                    trendChart.data.datasets[0].data = [...profitData];
                    trendChart.data.datasets[1].data = [...expensesData];
                    trendChart.data.datasets[2].data = [...netProfitData];
                    trendChart.data.datasets[3].data = [...earningsData];
                    trendChart.update('none');
                }

                const failedCount = results.length - appliedCount;
                if (failedCount > 0) {
                    console.warn(`按日卡片口径关键日期覆盖部分失败: ${failedCount}/${results.length}`);
                }
            })
            .catch((pointError) => {
                console.warn('按日卡片口径加载失败，回退当前图表数据:', pointError);
            });
    }
}

// 创建图表的辅助函数
function createChart(canvas, chartData) {
    try {
        // 检查 Chart.js 是否已加载
        if (typeof Chart === 'undefined') {
            console.error('Chart.js 库未加载');
            showError('Chart library not loaded, please refresh the page');
            return;
        }

        // 检查 canvas 是否存在
        if (!canvas) {
            console.error('Canvas 元素不存在');
            return;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error('无法获取 canvas context');
            return;
        }

        // 从外部变量获取元数据
        const sortedDates = chartMetadata.sortedDates || [];
        const capitalData = chartMetadata.capitalData || [];
        const expensesData = chartMetadata.expensesData || [];
        const profitData = chartMetadata.profitData || [];

        // 确保 chartData 结构正确
        if (!chartData || !chartData.labels || !chartData.datasets) {
            console.error('图表数据格式不正确', chartData);
            return;
        }

        console.log('创建图表，数据点数量:', chartData.labels.length, '数据集数量:', chartData.datasets.length);

        // 等价于 CSS clamp(9px, 0.82vw, 15px)
        const axisFontSize = Math.round(Math.min(15, Math.max(9, (0.82 / 100) * window.innerWidth)));

        // 如果图表已存在，先销毁
        if (trendChart) {
            try {
                trendChart.destroy();
            } catch (e) {
                console.warn('销毁旧图表时出错:', e);
            }
            trendChart = null;
        }

        trendChart = new Chart(ctx, {
            type: 'line',
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 0 // 禁用动画避免闪屏
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        ticks: {
                            callback: function (value) {
                                return formatCurrency(value);
                            },
                            font: { size: axisFontSize }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            font: { size: axisFontSize },
                            maxRotation: 0,
                            minRotation: 0,
                            autoSkip: false,
                            maxTicksLimit: undefined,
                            // 多月/年份范围：按月份显示刻度；短范围仍按天，但只在每月1号显示标签
                            callback: function (value, index) {
                                try {
                                    // 优先使用 sortedDates 中的原始日期键（与数据一一对应）
                                    const rawDate = (sortedDates && sortedDates[index]) ||
                                        (chartData.labels && chartData.labels[index]);
                                    if (!rawDate) return '';

                                    // 多月/年份范围：rawDate 为 "YYYY-MM"，显示 "Mon YYYY"
                                    if (shouldAggregateByMonth() && rawDate.match(/^\d{4}-\d{2}$/)) {
                                        const [yearStr, monthStr] = rawDate.split('-');
                                        const year = parseInt(yearStr, 10);
                                        const month = parseInt(monthStr, 10);
                                        if (!year || !month) return '';
                                        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                                        return `${monthNames[month - 1]} ${year}`;
                                    }

                                    // 其它情况：rawDate 可能是 "YYYY-MM-DD" 或 "DD/MM"
                                    let year, month, day;
                                    if (rawDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
                                        // YYYY-MM-DD
                                        const parts = rawDate.split('-');
                                        year = parseInt(parts[0], 10);
                                        month = parseInt(parts[1], 10);
                                        day = parseInt(parts[2], 10);
                                    } else if (rawDate.match(/^\d{1,2}\/\d{1,2}$/)) {
                                        // DD/MM（无年份，用当前年份兜底）
                                        const parts = rawDate.split('/');
                                        day = parseInt(parts[0], 10);
                                        month = parseInt(parts[1], 10);
                                        year = new Date().getFullYear();
                                    } else {
                                        const d = new Date(rawDate);
                                        if (isNaN(d.getTime())) return '';
                                        year = d.getFullYear();
                                        month = d.getMonth() + 1;
                                        day = d.getDate();
                                    }

                                    // 日级别视图：直接显示“几号”（1,2,3,...）
                                    return String(day || '');
                                } catch (e) {
                                    return '';
                                }
                            }
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleFont: {
                            size: 13,
                            weight: 'bold'
                        },
                        bodyFont: {
                            size: 12
                        },
                        callbacks: {
                            title: function (context) {
                                if (context.length > 0) {
                                    const dataIndex = context[0].dataIndex;
                                    const date = sortedDates[dataIndex];
                                    if (date) {
                                        try {
                                            // 按月份聚合时，date 是 "YYYY-MM" 格式
                                            if (shouldAggregateByMonth() && date.match(/^\d{4}-\d{2}$/)) {
                                                const [year, month] = date.split('-');
                                                const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                                                return `${monthNames[parseInt(month) - 1]} ${year}`;
                                            }
                                            // 否则是日期格式（日/月/年）
                                            const dateObj = new Date(date);
                                            if (!isNaN(dateObj.getTime())) {
                                                return `${dateObj.getDate()}/${dateObj.getMonth() + 1}/${dateObj.getFullYear()}`;
                                            }
                                        } catch (e) {
                                            return date;
                                        }
                                    }
                                }
                                return '';
                            },
                            label: function (context) {
                                const label = context.dataset.label || '';
                                const value = context.parsed.y;
                                return label + ': RM ' + formatCurrency(value);
                            },
                            afterBody: function (context) {
                                if (context.length > 0) {
                                    const dataIndex = context[0].dataIndex;
                                    const date = sortedDates[dataIndex];
                                    if (date) {
                                        try {
                                            const dateObj = new Date(date);
                                            if (!isNaN(dateObj.getTime())) {
                                                const p = chartMetadata.profitData[dataIndex] || 0;
                                                const e = chartMetadata.expensesData[dataIndex] || 0;
                                                const np = chartMetadata.netProfitData[dataIndex] || 0;
                                                const er = chartMetadata.earningsData[dataIndex] || 0;
                                                return [
                                                    '',
                                                    '--- Summary ---',
                                                    `Profit: RM ${formatCurrency(p)}`,
                                                    `Expenses: RM ${formatCurrency(e)}`,
                                                    `NET PROFIT: RM ${formatCurrency(np)}`,
                                                    `Earnings: RM ${formatCurrency(er)}`
                                                ];
                                            }
                                        } catch (e) {
                                            return [];
                                        }
                                    }
                                }
                                return [];
                            }
                        }
                    },
                    legend: {
                        display: false
                    }
                }
            }
        });
    } catch (createError) {
        console.error('创建图表失败:', createError);
        showError('Chart rendering failed');
    }
}

// ==================== 加载 Owner Companies ====================
// 存储所有公司数据（含 group_id）以便 group 筛选
let allOwnerCompanies = [];
let selectedDashboardGroup = null; // null = 显示所有
let isDashboardGroupAllMode = false; // true = 全选 group 旗下所有公司汇总

// 账户下是否存在「Group 筛选」语义（有任意公司带 group_id）
function dashboardOwnerHasGroupFilterUI() {
    if (!Array.isArray(allOwnerCompanies) || allOwnerCompanies.length === 0) return false;
    return allOwnerCompanies.some(c => c.group_id && String(c.group_id).trim() !== '');
}

// 是否允许拉取 Dashboard 数据 / 高亮币别：未选 Group 时，session 公司不能仍挂在某个 Group 下（否则 UI 上无 Group/Company 却仍显示数据）
function isDashboardDataScopeValid() {
    if (!window.companyId) return false;
    if (!dashboardOwnerHasGroupFilterUI()) return true;

    if (selectedDashboardGroup) {
        if (isDashboardGroupAllMode) {
            const groupCompanies = allOwnerCompanies.filter(c =>
                c.group_id && c.group_id.toUpperCase() === selectedDashboardGroup &&
                c.company_id && String(c.company_id).trim() !== ''
            );
            return groupCompanies.length > 0;
        }
        // 当前公司在 allOwnerCompanies 里可能有原生行 + 虚拟行（group_id 不同）。
        // 只要 .some() 能找到任意一条 (id, group_id=selectedDashboardGroup) 就合法。
        return allOwnerCompanies.some(c =>
            parseInt(c.id) === parseInt(window.companyId) &&
            c.group_id && c.group_id.toUpperCase() === selectedDashboardGroup
        );
    }

    const cur = allOwnerCompanies.find(c => parseInt(c.id) === parseInt(window.companyId));
    if (!cur) return false;
    return !cur.group_id || String(cur.group_id).trim() === '';
}

function clearDashboardForInvalidScope() {
    lastRequestParams = null;
    window.dashboardCurrency = '';
    const cw = document.getElementById('currency-buttons-wrapper');
    const cc = document.getElementById('currency-buttons-container');
    if (cc) cc.innerHTML = '';
    if (cw) cw.style.display = 'none';

    const capitalEl = document.getElementById('capital-value');
    const expensesEl = document.getElementById('expenses-value');
    const profitEl = document.getElementById('profit-value');
    const earningsEl = document.getElementById('earnings-value');
    if (capitalEl) capitalEl.textContent = '0.00';
    if (expensesEl) expensesEl.textContent = '0.00';
    if (profitEl) profitEl.textContent = '0.00';
    if (earningsEl) earningsEl.textContent = '0.00';

    chartMetadata = {
        sortedDates: [],
        capitalData: [],
        expensesData: [],
        profitData: [],
        netProfitData: [],
        earningsData: [],
        cardProfitDisplay: 0,
        cardExpensesDisplay: 0
    };

    const chartCanvas = document.getElementById('trend-chart');
    if (trendChart) {
        try {
            trendChart.destroy();
        } catch (e) {
            console.warn('销毁趋势图时出错:', e);
        }
        trendChart = null;
    }
    if (chartCanvas && typeof Chart !== 'undefined') {
        createChart(chartCanvas, { labels: [], datasets: [] });
    }

    const chartDateRangeEl = document.getElementById('chart-date-range');
    if (chartDateRangeEl && dateRange && dateRange.startDate && dateRange.endDate) {
        chartDateRangeEl.textContent =
            `${formatDateForDisplay(dateRange.startDate)} to ${formatDateForDisplay(dateRange.endDate)}`;
        chartDateRangeEl.style.color = '#9ca3af';
    }
}

function loadOwnerCompanies() {
    return fetch(buildApiUrl('api/transactions/get_owner_companies_api.php?all=1'))
        .then(response => response.json())
        .then(data => {
            if (data.success && data.data.length > 0) {
                allOwnerCompanies = data.data;

                // 提取 unique group_ids
                const groups = [...new Set(
                    data.data
                        .filter(c => c.group_id)
                        .map(c => c.group_id.toUpperCase())
                )].sort();

                // 从 sessionStorage 恢复 Group
                const savedGroup = sessionStorage.getItem('dashboard_group_filter');
                // 优先选 group_id 匹配 savedGroup 的那条（可能是虚拟行，表示同一个 c.id 被
                // 通过 group-link 也挂到了 savedGroup 下），这样用户在 AP 筛选下点 IG 公司
                // 不会被 reload 后跳回到 IG。
                const currentCompany =
                    (savedGroup
                        ? data.data.find(c =>
                            parseInt(c.id) === parseInt(window.companyId) &&
                            c.group_id && c.group_id.toUpperCase() === savedGroup
                          )
                        : null)
                    || data.data.find(c => parseInt(c.id) === parseInt(window.companyId));
                console.log('[Dashboard] loadOwnerCompanies | savedGroup:', savedGroup, '| groups:', groups, '| window.companyId:', window.companyId);

                if (savedGroup && groups.includes(savedGroup)) {
                    // 检查当前公司是否在任何一条 row 里属于 savedGroup（原生或虚拟）
                    const companyUnderSavedGroup = data.data.some(c =>
                        parseInt(c.id) === parseInt(window.companyId) &&
                        c.group_id && c.group_id.toUpperCase() === savedGroup
                    );
                    if (companyUnderSavedGroup) {
                        selectedDashboardGroup = savedGroup;
                        console.log('[Dashboard] Restored selectedDashboardGroup =', savedGroup);
                    } else {
                        console.log('[Dashboard] savedGroup', savedGroup, 'does not cover current company, clearing');
                        sessionStorage.removeItem('dashboard_group_filter');
                        selectedDashboardGroup = null;
                    }
                } else if (savedGroup) {
                    console.log('[Dashboard] savedGroup', savedGroup, 'NOT in groups list, clearing');
                    sessionStorage.removeItem('dashboard_group_filter');
                    selectedDashboardGroup = null;
                }

                // 如果经过上述验证后并没有选中 Group（首次登录），但当前公司属于某个 Group，
                // 说明用户是通过 Group ID 登录的，自动点亮该 Group
                if (!selectedDashboardGroup && currentCompany && currentCompany.group_id && currentCompany.group_id.trim() !== '') {
                    selectedDashboardGroup = currentCompany.group_id.toUpperCase();
                    sessionStorage.setItem('dashboard_group_filter', selectedDashboardGroup);
                    console.log('[Dashboard] Auto-selected group based on current company:', selectedDashboardGroup);
                }

                // 渲染 Group pills（只在有 group 时才显示）
                if (groups.length > 0) {
                    renderGroupButtons(groups);
                }

                // 渲染 Company buttons
                if (data.data.length > 0) {
                    if (data.data.length === 1) {
                        window.companyId = data.data[0].id;
                    }
                    renderCompanyButtons(data.data);
                }
            }
            return data;
        })
        .catch(error => {
            console.error('加载 Company 列表失败:', error);
            return { success: true, data: [] };
        });
}

function renderGroupButtons(groups) {
    const wrapper = document.getElementById('group-buttons-wrapper');
    const container = document.getElementById('group-buttons-container');
    if (!wrapper || !container) return;
    container.innerHTML = '';

    groups.forEach(groupId => {
        const btn = document.createElement('button');
        btn.className = 'transaction-company-btn';
        btn.textContent = groupId;
        btn.dataset.groupId = groupId;

        if (selectedDashboardGroup === groupId) {
            btn.classList.add('active');
        }

        btn.addEventListener('click', async function () {
            if (selectedDashboardGroup === groupId) {
                // 再次点击 → 取消选择，默认选择首个独立公司
                isDashboardGroupAllMode = false;
                selectedDashboardGroup = null;
                sessionStorage.removeItem('dashboard_group_filter');
                btn.classList.remove('active');
                
                const independentCompanies = allOwnerCompanies.filter(c =>
                    (!c.group_id || c.group_id.trim() === '') && c.company_id && c.company_id.trim() !== ''
                );

                if (independentCompanies.length > 0) {
                    const firstCompany = independentCompanies[0];
                    if (parseInt(firstCompany.id) !== parseInt(window.companyId)) {
                        switchCompany(firstCompany.id, firstCompany.company_id);
                    } else {
                        renderCompanyButtons(allOwnerCompanies);
                    }
                } else {
                    renderCompanyButtons(allOwnerCompanies);
                }
                lastRequestParams = null;
                await loadCurrencies();
                if (isDashboardDataScopeValid()) {
                    await loadData(true);
                } else {
                    clearDashboardForInvalidScope();
                }
            } else {
                // 选择该 group
                selectedDashboardGroup = groupId;
                sessionStorage.setItem('dashboard_group_filter', groupId);
                
                // 更新 group 按钮状态
                container.querySelectorAll('.transaction-company-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // 默认选择该 group 旗下的第一家公司并同步 session
                // 注意：一视同仁 — 同时包含 group_id 匹配的公司，排除只有 group 占位符、没有真实 company_id 的记录
                const groupCompanies = allOwnerCompanies.filter(c =>
                    c.group_id && c.group_id.toUpperCase() === groupId && c.company_id && c.company_id.trim() !== ''
                );
                console.log('[Dashboard] Group clicked:', groupId,
                    '| window.companyId:', window.companyId,
                    '| groupCompanies:', JSON.stringify(groupCompanies.map(c => ({id:c.id, name:c.company_id, gid:c.group_id}))));

                async function refreshDashboardAfterGroupSelect() {
                    lastRequestParams = null;
                    await loadCurrencies();
                    if (isDashboardDataScopeValid()) {
                        await loadData(true);
                    } else {
                        clearDashboardForInvalidScope();
                    }
                }

                if (groupCompanies.length > 0) {
                    const firstCompany = groupCompanies[0];
                    console.log('[Dashboard] firstCompany:', firstCompany.company_id, firstCompany.id, '| same?', parseInt(firstCompany.id) === parseInt(window.companyId));
                    if (parseInt(firstCompany.id) !== parseInt(window.companyId)) {
                        switchCompany(firstCompany.id, firstCompany.company_id);
                    } else {
                        // 当前公司就是该 group 的第一家，直接渲染并高亮
                        console.log('[Dashboard] Already on first company, just re-rendering');
                        renderCompanyButtons(allOwnerCompanies);
                        await refreshDashboardAfterGroupSelect();
                    }
                } else {
                    // groupCompanies 为空（partner 公司 group_id 与 groupId 不一致）
                    // 直接渲染，显示当前公司，通过 fallback 逻辑高亮
                    console.log('[Dashboard] No groupCompanies found for', groupId, '— re-rendering with fallback');
                    renderCompanyButtons(allOwnerCompanies);
                    await refreshDashboardAfterGroupSelect();
                }
            }
        });

        container.appendChild(btn);
    });

    wrapper.style.display = 'flex';
}

function renderCompanyButtons(companies) {
    const wrapper = document.getElementById('company-buttons-wrapper');
    const container = document.getElementById('company-buttons-container');
    if (!wrapper || !container) return;
    container.innerHTML = '';

    // 根据选中的 group 筛选
    let filtered = companies;
    if (selectedDashboardGroup) {
        // 严格根据 selectedDashboardGroup 筛选，避免其它 group 的公司跨界混入
        filtered = companies.filter(c =>
            c.group_id && c.group_id.toUpperCase() === selectedDashboardGroup
        );
    } else {
        // 如果没有选中任何 group，则只显示独立的公司
        filtered = companies.filter(c => !c.group_id || c.group_id.trim() === '');
    }
    
    // 隐藏只作为 group 占位符而没有实质公司名称的记录
    filtered = filtered.filter(c => c.company_id && c.company_id.trim() !== '');
    console.log('[Dashboard] renderCompanyButtons | selectedGroup:', selectedDashboardGroup, '| window.companyId:', window.companyId, '| filtered:', JSON.stringify(filtered.map(c=>({id:c.id,name:c.company_id,gid:c.group_id}))));

    if (filtered.length === 0) {
        wrapper.style.display = 'none';
        return;
    }

    // 当有 group 被选中且该 group 旗下有多于一家公司时，插入 [All] 按钮
    if (selectedDashboardGroup && filtered.length > 1) {
        const allBtn = document.createElement('button');
        allBtn.className = 'transaction-company-btn dashboard-all-btn';
        allBtn.textContent = 'All';
        allBtn.dataset.groupAll = selectedDashboardGroup;

        if (isDashboardGroupAllMode) {
            allBtn.classList.add('active');
        }

        allBtn.addEventListener('click', async function () {
            if (isDashboardGroupAllMode) {
                // 再次点击 All → 取消全选，切回第一家公司
                isDashboardGroupAllMode = false;
                allBtn.classList.remove('active');
                const firstCompany = filtered[0];
                switchCompany(firstCompany.id, firstCompany.company_id);
            } else {
                // 激活 All 模式
                isDashboardGroupAllMode = true;
                // 只亮 All 按钮自己，公司按钮都不亮（与 transaction.php All 行为一致）
                container.querySelectorAll('.transaction-company-btn').forEach(b => b.classList.remove('active'));
                allBtn.classList.add('active');
                lastRequestParams = null;
                await loadData(true);
            }
        });
        container.appendChild(allBtn);
    }

    filtered.forEach(company => {
        const btn = document.createElement('button');
        btn.className = 'transaction-company-btn';
        btn.textContent = company.company_id;
        
        // Retain external flag for filtering but don't show ugly badge
        if (company.is_external == 1) {
            btn.dataset.isExternal = "1";
        }

        btn.dataset.companyId = company.id;
        
        // 全选模式下只亮 All 按钮（公司按钮不高亮）；否则只高亮当前公司
        if (!isDashboardGroupAllMode && parseInt(company.id) === parseInt(window.companyId)) {
            btn.classList.add('active');
        }

        btn.addEventListener('click', async function () {
            // 退出全选模式，切换到单公司
            if (isDashboardGroupAllMode) {
                isDashboardGroupAllMode = false;
            }
            // 单公司模式：原有逻辑，刷新整页并同步 session
            switchCompany(company.id, company.company_id);
        });
        container.appendChild(btn);
    });

    wrapper.style.display = filtered.length > 0 ? 'flex' : 'none';
}

// ==================== Group 模式下的 Currency 交集 ====================
async function loadGroupCurrencies() {
    return loadCurrencies(); // 不再需要交集，因为公司被强制单选
}

// ==================== Currency 选择（Company 下方）：可拖动、默认第一个（与 Transaction List / Member Win/Loss 一致） ====================
window.dashboardCurrency = '';

function loadCurrencies() {
    if (!window.companyId) {
        const wrapper = document.getElementById('currency-buttons-wrapper');
        if (wrapper) wrapper.style.display = 'none';
        return Promise.resolve();
    }
    if (!isDashboardDataScopeValid()) {
        window.dashboardCurrency = '';
        const wrapper = document.getElementById('currency-buttons-wrapper');
        const container = document.getElementById('currency-buttons-container');
        if (container) container.innerHTML = '';
        if (wrapper) wrapper.style.display = 'none';
        return Promise.resolve();
    }
    return Promise.all([
        fetch(buildApiUrl(`api/transactions/get_company_currencies_api.php?company_id=${window.companyId}`)).then(res => res.json()),
        fetch(`api/transactions/user_currency_order_api.php?_t=${Date.now()}`).then(res => res.json()).catch(() => null)
    ])
        .then(([data, orderData]) => {
            const wrapper = document.getElementById('currency-buttons-wrapper');
            const container = document.getElementById('currency-buttons-container');
            if (!wrapper || !container) return;
            container.innerHTML = '';
            if (data && data.success && data.data && data.data.length > 0) {
                // 应用保存的拖动顺序（数据库优先，如果没有再尝试 localStorage，Transaction 页拖动也会互相同步 localStorage）
                const savedOrderKey = 'dashboard_currency_order_' + (window.companyId || 0);
                let orderedData = [...data.data];
                try {
                    let saved = null;
                    if (orderData && orderData.success && Array.isArray(orderData.data?.order) && orderData.data.order.length > 0) {
                        saved = JSON.stringify(orderData.data.order);
                    } else {
                        saved = localStorage.getItem(savedOrderKey) || localStorage.getItem('dashboard_currency_order_global');
                    }
                    if (saved) {
                        const order = JSON.parse(saved);
                        if (Array.isArray(order) && order.length > 0) {
                            const normalized = [];
                            order.forEach(code => {
                                const upper = String(code || '').trim().toUpperCase();
                                if (!upper) return;
                                if (!normalized.includes(upper)) normalized.push(upper);
                            });
                            const byCode = new Map(orderedData.map(c => [(c.code || '').toUpperCase(), c]));
                            const ordered = [];
                            normalized.forEach(upper => {
                                if (byCode.has(upper)) {
                                    ordered.push(byCode.get(upper));
                                    byCode.delete(upper);
                                }
                            });
                            byCode.forEach(c => ordered.push(c));
                            orderedData = ordered;
                        }
                    }
                } catch (e) { /* ignore */ }
                // 默认始终选中当前顺序下的第一个货币（与按钮从左到右第一位一致）
                const firstCode = (orderedData[0] && orderedData[0].code) ? (orderedData[0].code || '').toUpperCase() : '';
                window.dashboardCurrency = firstCode || '';
                orderedData.forEach(c => {
                    const code = (c.code || '').toUpperCase();
                    const btn = document.createElement('button');
                    btn.className = 'transaction-company-btn' + (firstCode === code ? ' active' : '');
                    btn.textContent = code;
                    btn.dataset.currency = code;
                    btn.addEventListener('click', function () { switchCurrency(code); });
                    container.appendChild(btn);
                });
                initDashboardCurrencyDragDrop();
                wrapper.style.display = 'flex';
            } else {
                wrapper.style.display = 'none';
            }
            return data;
        })
        .catch(error => {
            console.error('加载 Currency 列表失败:', error);
            const wrapper = document.getElementById('currency-buttons-wrapper');
            if (wrapper) wrapper.style.display = 'none';
            return { success: true, data: [] };
        });
}

function initDashboardCurrencyDragDrop() {
    const container = document.getElementById('currency-buttons-container');
    if (!container) return;
    let draggedCode = null;
    container.querySelectorAll('.transaction-company-btn[data-currency]').forEach(btn => {
        btn.setAttribute('draggable', 'true');
        btn.addEventListener('dragstart', function (e) {
            draggedCode = btn.getAttribute('data-currency');
            e.dataTransfer.setData('text/plain', draggedCode);
            e.dataTransfer.effectAllowed = 'move';
            btn.classList.add('transaction-currency-dragging');
        });
        btn.addEventListener('dragend', function () {
            btn.classList.remove('transaction-currency-dragging');
            draggedCode = null;
        });
    });
    container.addEventListener('dragover', function (e) {
        if (!draggedCode) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const target = e.target.closest('.transaction-company-btn[data-currency]');
        if (target && target !== document.querySelector('.transaction-currency-dragging')) {
            target.classList.add('transaction-currency-drag-over');
        }
    });
    container.addEventListener('dragleave', function (e) {
        if (!e.currentTarget.contains(e.relatedTarget)) {
            container.querySelectorAll('.transaction-currency-drag-over').forEach(el => el.classList.remove('transaction-currency-drag-over'));
        }
    });
    container.addEventListener('drop', function (e) {
        e.preventDefault();
        container.querySelectorAll('.transaction-currency-drag-over').forEach(el => el.classList.remove('transaction-currency-drag-over'));
        if (!draggedCode) return;
        const target = e.target.closest('.transaction-company-btn[data-currency]');
        if (!target) return;
        const allButtons = [...container.querySelectorAll('.transaction-company-btn[data-currency]')];
        const fromIndex = allButtons.findIndex(b => b.getAttribute('data-currency') === draggedCode);
        const toIndex = allButtons.indexOf(target);
        if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
        const moved = allButtons[fromIndex];
        if (toIndex < fromIndex) {
            container.insertBefore(moved, allButtons[toIndex]);
        } else {
            container.insertBefore(moved, allButtons[toIndex].nextSibling);
        }
        const newOrder = [...container.querySelectorAll('.transaction-company-btn[data-currency]')]
            .map(b => String(b.getAttribute('data-currency') || '').trim().toUpperCase())
            .filter(Boolean)
            .filter((code, idx, arr) => arr.indexOf(code) === idx);
        try {
            const cid = window.companyId || 0;
            const key = 'dashboard_currency_order_' + cid;
            const serialized = JSON.stringify(newOrder);
            localStorage.setItem(key, serialized);
            localStorage.setItem('dashboard_currency_order_global', serialized);
            // 与 Transaction 列表共用同公司顺序，避免另一页拖动后全局 key 与 Dashboard 预期不一致
            localStorage.setItem('transaction_currency_order_' + cid, serialized);
            localStorage.setItem('transaction_currency_order_global', serialized);

            // 同时永久保存到数据库
            fetch('api/transactions/user_currency_order_api.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order: newOrder })
            }).catch(err => console.error('Failed to save currency order to DB:', err));
        } catch (err) { /* ignore */ }
        const first = newOrder[0];
        if (first) {
            switchCurrency(first);
        }
    });
}

async function switchCurrency(currencyCode) {
    const next = String(currencyCode || '').trim().toUpperCase();
    if (next && next === String(window.dashboardCurrency || '').trim().toUpperCase()) {
        return;
    }
    window.dashboardCurrency = next || '';
    const buttons = document.querySelectorAll('#currency-buttons-container .transaction-company-btn');
    buttons.forEach(btn => {
        const code = (btn.dataset.currency || '').toUpperCase();
        if (code === (window.dashboardCurrency || '').toUpperCase()) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    lastRequestParams = null;
    await loadData(true);
}

// ==================== 切换 Company ====================
async function switchCompany(companyId, companyCode) {
    try {
        // 先更新 session
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

            const response = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${companyId}`), {
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            let result = null;
            try {
                result = await response.json();
            } catch (e) {
                result = null;
            }

            if (!response.ok || !result || !result.success) {
                const apiMessage = (result && (result.error || result.message)) ? (result.error || result.message) : '';
                const error = new Error(apiMessage || `HTTP错误: ${response.status}`);
                if (result && result.data && result.data.reason) {
                    error.reason = result.data.reason;
                }
                throw error;
            }
            if (typeof window.updateSidebarDataCaptureVisibility === 'function' && result.data) {
                window.updateSidebarDataCaptureVisibility(result.data.has_gambling, result.data.has_bank);
            }
        } catch (error) {
            const errMessage = error && error.message ? error.message : '';
            const errReason = error && error.reason ? error.reason : '';
            if (error.name === 'AbortError') {
                console.error('更新 session 超时');
            } else {
                console.error('更新 session 失败:', error);
            }
            if (shouldShowCompanyAccessModal(errMessage, errReason)) {
                const modalMessage = getCompanyAccessModalMessage(errReason, errMessage);
                await showDashboardAlertModal('Notice', modalMessage);
                showError(modalMessage);
            } else {
                showError('Failed to switch company, please refresh the page and try again');
            }
            return;
        }

        window.companyId = companyId;

        // 更新按钮状态
        const buttons = document.querySelectorAll('.transaction-company-btn');
        buttons.forEach(btn => {
            if (parseInt(btn.dataset.companyId) === parseInt(companyId)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        console.log('✅ 切换到 Company:', companyCode, 'ID:', companyId);

        // 切换公司后刷新页面，使侧栏根据新 session 重新渲染（选 C168 时显示 Domain / Announcement）
        window.location.reload();
        return;

        // 以下在 reload 后由页面重新加载时执行
        window.dashboardCurrency = 'MYR';
        await loadCurrencies();
        lastRequestParams = null;
        await loadData(true);
    } catch (error) {
        console.error('切换公司失败:', error);
        showError('Error switching company');
    }
}

// 初始化图表数据图例开关按钮
function initChartDataButtons() {
    const buttons = document.querySelectorAll('.chart-toggle-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', function () {
            this.classList.toggle('active');
            const datasetIndex = parseInt(this.dataset.dataset);
            
            if (trendChart) {
                const isHidden = !this.classList.contains('active');
                trendChart.setDatasetVisibility(datasetIndex, !isHidden);
                trendChart.update('none'); // Update without animation
            }
        });
    });
}

// 页面可见性优化：当页面不可见时，暂停自动刷新
let isPageVisible = true;
document.addEventListener('visibilitychange', function () {
    isPageVisible = !document.hidden;
    if (isPageVisible && dateRange.startDate && dateRange.endDate && isDashboardDataScopeValid()) {
        // 页面重新可见时，重置请求参数，允许重新加载
        lastRequestParams = null;
        loadData();
    }
});

// 图表容器尺寸变化时重绘图表，保证一屏内完整显示
(function setupChartResizeObserver() {
    function observeChartContainer() {
        const container = document.querySelector('.dashboard-chart-container');
        if (!container || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(function () {
            if (trendChart) trendChart.resize();
        });
        ro.observe(container);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observeChartContainer);
    } else {
        observeChartContainer();
    }
})();

// 初始化 - 使用防抖避免多次调用；兼容 DOM 已就绪后再执行（如脚本晚于 body 注入时）
let isInitializing = false;
async function runDashboardInit() {
    if (isInitializing) return;
    isInitializing = true;

    try {
        // 添加全局错误处理
        window.addEventListener('error', function (event) {
            console.error('全局错误:', event.error);
            if (event.error && event.error.message) {
                showError('Page error: ' + event.error.message);
            } else {
                showError('Page error, please refresh the page');
            }
            event.preventDefault(); // 阻止默认错误处理
        });

        window.addEventListener('unhandledrejection', function (event) {
            console.error('未处理的Promise拒绝:', event.reason);
            showError('Request failed, please refresh the page');
            event.preventDefault(); // 阻止默认错误处理
        });

        // 提前发起公司列表请求，与 initDatePickers 并行，减少首屏等待
        const loadCompaniesPromise = loadOwnerCompanies();
        initDatePickers();
        initChartDataButtons();
        await loadCompaniesPromise;
        // 串行执行：loadCurrencies 先完成后再 loadData，确保 window.dashboardCurrency 就绪
        if (dateRange.startDate && dateRange.endDate && window.companyId) {
            // loadCurrencies 必须先完成，以确保 window.dashboardCurrency 被正确设置后，
            // loadData 才带上正确的 currency 参数发起 API 请求；
            // 否则两者并行时 loadData 会在 dashboardCurrency 尚未赋值时就发出请求，
            // 导致不同货币（MYR / SGD）的数据混合在一起显示。
            await loadCurrencies();
            if (isDashboardDataScopeValid()) {
                await loadData(true);
            } else {
                clearDashboardForInvalidScope();
            }
        } else {
            await loadCurrencies();
            if (!window.companyId) {
                showError('Missing required parameters, please refresh the page');
            }
        }
    } catch (error) {
        console.error('初始化失败:', error);
        showError('Page initialization failed, please refresh the page');
    } finally {
        isInitializing = false;
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
        runDashboardInit();
    });
} else {
    runDashboardInit();
}
