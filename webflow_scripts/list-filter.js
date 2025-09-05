document.addEventListener('DOMContentLoaded', function() {
    
    // --- ELEMENT SELECTORS ---
    const listBtn = document.getElementById('switch-to-list');
    const calendarBtn = document.getElementById('switch-to-calendar');
    const filterToggleButton = document.querySelector('.filter-toggle');
    const pageLayout = document.querySelector('.event-page-layout');
    const middlePanel = document.querySelector('.middle-panel-grid');
    const mainListView = document.querySelector('.hide-list'); 
    const mainCalendarView = document.querySelectorAll('.code-embed-kalendar')[1];

    // Other variables
    let allEventsData = [];
    let realListContainer;

    // --- MASTER RENDER FUNCTION ---
    function renderUI() {
        if (!pageLayout || !middlePanel || !listBtn || !calendarBtn) {
            console.error("One or more essential elements for UI rendering are missing.");
            return;
        }
        if (mainListView && mainCalendarView) {
            const isCalendarViewActive = calendarBtn.classList.contains('active');
            if (isCalendarViewActive) {
                mainCalendarView.style.display = 'block';
                mainListView.style.display = 'none';
            } else {
                mainCalendarView.style.display = 'none';
                mainListView.style.display = 'block';
            }
        }
        const isFiltersHidden = pageLayout.classList.contains('filters-hidden');
        if (isFiltersHidden) {
            middlePanel.style.display = 'none';
        } else {
            middlePanel.style.display = 'flex';
        }
    }

    // --- EVENT LISTENERS ---
    if (filterToggleButton && listBtn && calendarBtn) {
        filterToggleButton.addEventListener('click', () => {
            pageLayout.classList.toggle('filters-hidden');
            const isHidden = pageLayout.classList.contains('filters-hidden');
            filterToggleButton.querySelector('span').textContent = isHidden ? 'Filter einblenden' : 'Filter ausblenden';
            renderUI();
        });
        listBtn.addEventListener('click', () => {
            calendarBtn.classList.remove('active');
            listBtn.classList.add('active');
            renderUI();
        });
        calendarBtn.addEventListener('click', () => {
            listBtn.classList.remove('active');
            calendarBtn.classList.add('active');
            renderUI();
        });
    }

    // --- DYNAMIC CARD POPULATION ---
    function populateCardDetails() {
        const dataMap = new Map();
        const hiddenDataItems = document.querySelectorAll('.hide-event-info_here .event-data-item');

        hiddenDataItems.forEach(item => {
            const eventId = item.querySelector('#eventid')?.textContent.trim();
            if (!eventId) return;

            const acronyms = Array.from(item.querySelectorAll('.airport-all-kuerzel'))
                                  .map(el => el.textContent.trim())
                                  .filter(Boolean);
            
            const bookingPercentageRaw = item.querySelector('#eventbookingpercentage')?.textContent.trim();
            
            dataMap.set(eventId, {
                location: item.querySelector('.location')?.textContent.trim(),
                airports: acronyms,
                bookingPercentage: !isNaN(parseInt(bookingPercentageRaw, 10)) ? parseInt(bookingPercentageRaw, 10) : null,
                isFullyBooked: item.querySelector('.isfullybooked')?.textContent.trim().toLowerCase() === 'true',
                eventName: item.querySelector('.name-event')?.textContent.trim(),
                startDate: item.querySelector('.start-date')?.textContent.trim(),
                endDate: item.querySelector('.end-date')?.textContent.trim(),
            });
        });

        const visibleEventItems = document.querySelectorAll('.w-dyn-list .w-dyn-item');
        visibleEventItems.forEach(card => {
            const cardId = card.querySelector('.hide-id')?.textContent.trim();
            if (!cardId) return;

            const data = dataMap.get(cardId);
            if (!data) return;

            // Update Airport Info
            const airportIcon = card.querySelector('img[src*="_Vector.svg"]');
            if (airportIcon) {
                const targetDiv = airportIcon.nextElementSibling;
                if (targetDiv) {
                    if (data.airports && data.airports.length > 0) {
                        targetDiv.textContent = 'ab ' + data.airports.join(', ');
                    } else {
                        targetDiv.textContent = 'Eigene Anreise';
                    }
                }
            }

            // Update Flag Info
            const flagElement = card.querySelector('.emoji-flag');
            if (flagElement && data.location) {
                if (data.location.toLowerCase() === 'lappland') {
                    flagElement.textContent = '🇸🇪';
                } else if (data.location.toLowerCase() === 'katschberg') {
                    flagElement.textContent = '🇦🇹';
                }
            }

            // Update Booking Status Info
            const statusContainer = card.querySelector('.topinfo-under');
            const bookingButton = card.querySelector('a.button.is-icon');
            const percentage = data.bookingPercentage;

            if (statusContainer && statusContainer.parentElement) {
                statusContainer.parentElement.style.display = 'none'; // Hide by default
                const statusTextEl = statusContainer.querySelector('div:not(.info-pin)');

                if (percentage !== null && statusTextEl) {
                    let statusText = '';
                    let showStatus = false;

                    if (percentage >= 75 && percentage < 85) {
                        statusText = 'nur noch wenige Plätze frei';
                        showStatus = true;
                    } else if (percentage >= 85 && percentage < 100) {
                        statusText = `Fast ausverkauft (${percentage}%)`;
                        showStatus = true;
                    } else if (percentage === 100 || data.isFullyBooked) {
                        statusText = 'ausverkauft, auf die Warteliste';
                        showStatus = true;
                        
                        if (bookingButton) {
                            const buttonText = bookingButton.querySelector('div');
                            if (buttonText) buttonText.textContent = 'Zur Warteliste';
                            
                            const waitlistUrl = new URL('/warteliste-event', window.location.origin);
                            waitlistUrl.searchParams.set('event_id', cardId);
                            waitlistUrl.searchParams.set('event_name', data.eventName);
                            waitlistUrl.searchParams.set('event_location', data.location);
                            waitlistUrl.searchParams.set('event_start_date', data.startDate);
                            waitlistUrl.searchParams.set('event_end_date', data.endDate);
                            bookingButton.href = waitlistUrl.toString();
                        }
                    }
                    
                    if (showStatus) {
                        statusTextEl.textContent = statusText;
                        statusContainer.parentElement.style.display = 'block';
                    }
                }
            }
        });
    }

    // --- HELPER FUNCTIONS ---
    function findVisibleEventCard(eventName) {
        if (!realListContainer) {
            realListContainer = document.querySelector('.listenansicht-events-wrapper');
        }
        if (!realListContainer) return null;
        const cardTitleSelector = '#event-name-list';
        const allCards = realListContainer.querySelectorAll('.wrapper-card-event-liste');
        for (const card of allCards) {
            const cardTitleEl = card.querySelector(cardTitleSelector);
            if (cardTitleEl && cardTitleEl.textContent.trim() === eventName) {
                return card;
            }
        }
        return null;
    }

    function sortAndRedrawEvents(sortBy, sortDir = 'asc') {
        allEventsData.sort((a, b) => {
            let valA = a[sortBy];
            let valB = b[sortBy];
            if (valA < valB) return sortDir === 'asc' ? -1 : 1;
            if (valA > valB) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
        if (realListContainer) {
            allEventsData.forEach(event => {
                if (event.element) {
                    realListContainer.appendChild(event.element);
                }
            });
        }
    }

    function setupSortDropdown() {
        const sortButton = document.querySelector('.control-button.dropdown');
        if (!sortButton) return;
        const wrapper = document.createElement('div');
        wrapper.style.position = 'relative';
        sortButton.parentNode.insertBefore(wrapper, sortButton);
        wrapper.appendChild(sortButton);
        const dropdownHTML = `<div class="sort-dropdown-list" style="display: none;"><a href="#" class="sort-option active" data-sort-by="startDate" data-sort-dir="asc">Datum (aufsteigend)</a><a href="#" class="sort-option" data-sort-by="startDate" data-sort-dir="desc">Datum (absteigend)</a><a href="#" class="sort-option" data-sort-by="price" data-sort-dir="asc">Preis (niedrigster)</a><a href="#" class="sort-option" data-sort-by="price" data-sort-dir="desc">Preis (höchster)</a><a href="#" class="sort-option" data-sort-by="popularity" data-sort-dir="desc">Beliebtheit</a></div>`;
        wrapper.insertAdjacentHTML('beforeend', dropdownHTML);
        const dropdown = wrapper.querySelector('.sort-dropdown-list');
        const buttonTextSpan = sortButton.querySelector('span');
        sortButton.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.style.display = dropdown.style.display === 'none' ? 'flex' : 'none';
        });
        dropdown.addEventListener('click', (e) => {
            e.preventDefault();
            const target = e.target.closest('.sort-option');
            if (!target) return;
            dropdown.querySelectorAll('.sort-option').forEach(opt => opt.classList.remove('active'));
            target.classList.add('active');
            sortAndRedrawEvents(target.dataset.sortBy, target.dataset.sortDir);
            buttonTextSpan.textContent = target.textContent;
            dropdown.style.display = 'none';
        });
        document.addEventListener('click', () => {
            if (dropdown.style.display === 'flex') {
                dropdown.style.display = 'none';
            }
        });
    }

    function populateFiltersUI() {
        const uniqueLocations = [...new Set(allEventsData.map(e => e.location).filter(Boolean))];
        const uniqueAirports = [...new Set(allEventsData.flatMap(e => e.airports).filter(Boolean))];
        const dayValues = allEventsData.map(e => e.days).filter(d => !isNaN(d));
        const minDays = dayValues.length > 0 ? Math.min(...dayValues) : 1;
        const maxDays = dayValues.length > 0 ? Math.max(...dayValues) : 7;
        const priceValues = allEventsData.map(e => e.price).filter(p => !isNaN(p));
        const minPrice = priceValues.length > 0 ? Math.min(...priceValues) : 1000;
        const maxPrice = priceValues.length > 0 ? Math.max(...priceValues) : 10000;
        let locationList = null;
        document.querySelectorAll('.filters-column .filter-group').forEach(group => {
            const titleEl = group.querySelector('.filter-title');
            if (titleEl && titleEl.textContent.trim() === 'Ort') {
                locationList = group.querySelector('.filter-options-list');
            }
        });
        if (locationList) {
            locationList.innerHTML = '';
            uniqueLocations.forEach(loc => {
                const value = loc.toLowerCase().replace(/\s+/g, '-');
                const label = document.createElement('label');
                label.className = 'filter-checkbox-label';
                label.innerHTML = `<input type="checkbox" name="location" value="${value}" checked><span class="custom-checkbox"></span><div class="label-text-wrapper"><span>${loc}</span></div>`;
                locationList.appendChild(label);
            });
        }
        const airportList = document.querySelector('#airport-filter .filter-options-list');
        if (airportList) {
            while (airportList.children.length > 1) {
                airportList.removeChild(airportList.lastChild);
            }
            uniqueAirports.forEach(airport => {
                const value = airport.toLowerCase().replace(/\s+/g, '-');
                const label = document.createElement('label');
                label.className = 'filter-radio-label';
                label.innerHTML = `<input type="radio" name="airport" value="${value}"><span class="custom-radio"></span><span class="label-text-wrapper">${airport}</span>`;
                airportList.appendChild(label);
            });
        }
        const daysSlider = document.querySelector('#days-slider');
        if (daysSlider) {
            daysSlider.querySelector('.min-slider').min = minDays;
            daysSlider.querySelector('.min-slider').max = maxDays;
            daysSlider.querySelector('.min-slider').value = minDays;
            daysSlider.querySelector('.max-slider').min = minDays;
            daysSlider.querySelector('.max-slider').max = maxDays;
            daysSlider.querySelector('.max-slider').value = maxDays;
            setupRangeSlider('days-slider', 'days-min-value', 'days-max-value');
        }
        const priceSlider = document.querySelector('#price-slider');
        if (priceSlider) {
            priceSlider.querySelector('.min-slider').min = minPrice;
            priceSlider.querySelector('.min-slider').max = maxPrice;
            priceSlider.querySelector('.min-slider').value = minPrice;
            priceSlider.querySelector('.max-slider').min = minPrice;
            priceSlider.querySelector('.max-slider').max = maxPrice;
            priceSlider.querySelector('.max-slider').value = maxPrice;
            setupRangeSlider('price-slider', 'price-min-value', 'price-max-value', true);
        }
    }

    function initializeDynamicContent() {
        const eventDataItems = document.querySelectorAll('.hide-event-info_here .event-data-item');
        if (eventDataItems.length === 0) return;
        allEventsData = Array.from(eventDataItems).map(item => {
            const eventName = item.querySelector('.name-event')?.textContent.trim();
            return {
                element: findVisibleEventCard(eventName),
                location: item.querySelector('.location')?.textContent.trim(),
                days: parseInt(item.querySelector('.event-driving-days')?.textContent.trim(), 10),
                price: parseInt(item.querySelector('.event-price')?.textContent.trim(), 10),
                airports: Array.from(item.querySelectorAll('.airport-data')).map(el => el.textContent.trim()),
                startDate: new Date(item.querySelector('.start-date')?.textContent.trim()),
                popularity: parseInt(item.querySelector('.eventbookingpercentage')?.textContent.trim(), 10)
            };
        });
        populateFiltersUI();
        setupSortDropdown();
        sortAndRedrawEvents('startDate', 'asc');
    }

    function setupRangeSlider(sliderId, minValId, maxValId, isPrice = false) {
        const sliderContainer = document.querySelector(`#${sliderId}`);
        if (!sliderContainer) return;
        const minSlider = sliderContainer.querySelector('.min-slider');
        const maxSlider = sliderContainer.querySelector('.max-slider');
        const minValueDisplay = document.getElementById(minValId);
        const maxValueDisplay = document.getElementById(maxValId);
        const sliderRange = sliderContainer.querySelector('.slider-range');
        function updateRange() {
            let minVal = parseInt(minSlider.value);
            let maxVal = parseInt(maxSlider.value);
            if (maxVal < minVal) {
                [minVal, maxVal] = [maxVal, minVal];
                minSlider.value = minVal;
                maxSlider.value = maxVal;
            }
            const minPercent = ((minVal - minSlider.min) / (minSlider.max - minSlider.min)) * 100;
            const maxPercent = ((maxVal - maxSlider.min) / (maxSlider.max - minSlider.min)) * 100;
            sliderRange.style.left = `${minPercent}%`;
            sliderRange.style.width = `${maxPercent - minPercent}%`;
            if (isPrice) {
                minValueDisplay.textContent = `${minVal.toLocaleString('de-DE')} €`;
                maxValueDisplay.textContent = `${maxVal.toLocaleString('de-DE')} €`;
            } else {
                minValueDisplay.textContent = minVal;
                maxValueDisplay.textContent = maxVal;
            }
        }
        minSlider.addEventListener('input', updateRange);
        maxSlider.addEventListener('input', updateRange);
        updateRange();
    }
    
    const calendarWrapper = document.querySelector('.fc-wrapper');
    if (calendarWrapper) {
        const monthDisplay = document.getElementById('fc-month');
        const prevBtn = document.getElementById('fc-prev-btn');
        const nextBtn = document.getElementById('fc-next-btn');
        const dayGrid = document.getElementById('fc-day-grid');
        let currentDate = new Date('2025-09-01');
        let startDate = null;
        let endDate = null;
        const monthNames = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
        const renderCalendar = () => {
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();
            monthDisplay.textContent = `${monthNames[month]} ${year}`;
            dayGrid.innerHTML = '';
            const firstDayOfMonth = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const dayOffset = (firstDayOfMonth === 0) ? 6 : firstDayOfMonth - 1;
            for (let i = 0; i < dayOffset; i++) { dayGrid.appendChild(document.createElement('div'));}
            for (let day = 1; day <= daysInMonth; day++) {
                const cell = document.createElement('div');
                cell.className = 'fc-cell';
                cell.dataset.date = new Date(year, month, day).toISOString().split('T')[0];
                const dateDiv = document.createElement('div');
                dateDiv.className = 'fc-cell__date';
                dateDiv.textContent = day;
                cell.appendChild(dateDiv);
                dayGrid.appendChild(cell);
            }
            updateSelectionVisuals();
        };
        const handleDateClick = (e) => {
            const cell = e.target.closest('.fc-cell');
            if (!cell || !cell.dataset.date) return;
            const clickedDate = new Date(cell.dataset.date);
            if (startDate && clickedDate.getTime() === startDate.getTime() && !endDate) {
                startDate = null;
            } else if (!startDate || (startDate && endDate)) {
                startDate = clickedDate;
                endDate = null;
            } else if (clickedDate < startDate) {
                startDate = clickedDate;
            } else {
                endDate = clickedDate;
            }
            updateSelectionVisuals();
        };
        const updateSelectionVisuals = () => {
            for (const cell of dayGrid.children) {
                if (!cell.dataset.date) continue;
                const cellDate = new Date(cell.dataset.date);
                const isSelected = (startDate && cellDate.getTime() === startDate.getTime()) || (endDate && cellDate.getTime() === endDate.getTime());
                const isStartDate = startDate && cellDate.getTime() === startDate.getTime();
                const isEndDate = endDate && cellDate.getTime() === endDate.getTime();
                const isInRange = startDate && endDate && cellDate > startDate && cellDate < endDate;
                cell.classList.toggle('is-selected', isSelected);
                cell.classList.toggle('is-start-date', isStartDate);
                cell.classList.toggle('is-end-date', isEndDate);
                cell.classList.toggle('is-in-range', isInRange);
            }
        };
        dayGrid.addEventListener('click', handleDateClick);
        prevBtn.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() - 1);
            renderCalendar();
        });
        nextBtn.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            renderCalendar();
        });
        renderCalendar();
    }
    
    // --- KICK OFF THE DYNAMIC SETUP ---
    initializeDynamicContent();
    populateCardDetails();
    renderUI();

});
