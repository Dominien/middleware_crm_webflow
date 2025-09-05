document.addEventListener('DOMContentLoaded', function() {

    // Main async function to run the script
    async function initializeCalendar() {

      /* ---------- PART 1: PARSE EVENT DATA ---------- */
      const events = [];
      const availableAirports = new Map();
      const eventItems = document.querySelectorAll('.event-data-item');

      eventItems.forEach((item, index) => {
        const nameEl = item.querySelector('.name-event');
        const locationEl = item.querySelector('.location');
        const startDateEl = item.querySelector('.start-date');
        const endDateEl = item.querySelector('.end-date');
        const statusEl = item.querySelector('.eventbookingstatuscode');
        const linkEl = item.querySelector('a');
        const fullyBookedEl = item.querySelector('.isfullybooked');
        const modelEl = item.querySelector('.porschemodelle');
        const airportItems = item.querySelectorAll('.airport-data');
        const drivingDaysEl = item.querySelector('.event-driving-days');
        const costEl = drivingDaysEl ? drivingDaysEl.nextElementSibling : null;

        const eventIdEl = item.querySelector('.eventid');
        const eventId = eventIdEl ? eventIdEl.textContent.trim() : null;

        const percentageEl = item.querySelector('.eventbookingpercentage');
        const percentageRaw = percentageEl ? percentageEl.textContent.trim() : null;
        const bookingPercentage = !isNaN(parseInt(percentageRaw, 10)) ? parseInt(percentageRaw, 10) : null;

        const eventAirports = [];
        airportItems.forEach(el => {
          const airportName = el.textContent.trim();
          const airportId = el.id;
          const kuerzelEl = el.parentElement.querySelector('.airport-all-kuerzel');
          const airportKuerzel = (kuerzelEl && kuerzelEl.textContent.trim()) ? kuerzelEl.textContent.trim() : null;

          if (airportName && airportId) {
            eventAirports.push({
              id: airportId,
              name: airportName,
              kuerzel: airportKuerzel
            });
            if (!availableAirports.has(airportId)) {
              availableAirports.set(airportId, {
                name: airportName,
                kuerzel: airportKuerzel
              });
            }
          }
        });

        if (eventId && nameEl && startDateEl && endDateEl && linkEl && locationEl) {
          const drivingDays = drivingDaysEl ? parseInt(drivingDaysEl.textContent.trim(), 10) : null;
          const costText = costEl ? costEl.textContent.trim() : 'N/A';
          const cost = costText !== 'N/A' ? parseFloat(costText) : null;
          const startDate = new Date(startDateEl.textContent.trim());
          const endDate = new Date(endDateEl.textContent.trim());
          startDate.setHours(0, 0, 0, 0);
          endDate.setHours(0, 0, 0, 0);

          const parsedEvent = {
            id: eventId,
            name: nameEl.textContent.trim(),
            location: locationEl.textContent.trim(),
            startDate: startDate,
            endDate: endDate,
            status: statusEl ? statusEl.textContent.trim() : 'Unknown',
            link: linkEl.getAttribute('href'),
            airports: eventAirports,
            drivingDays: drivingDays,
            cost: cost,
            models: modelEl ? modelEl.textContent.trim() : null,
            fullyBooked: (bookingPercentage === 100) || (fullyBookedEl && fullyBookedEl.textContent.trim().toLowerCase() === 'true'),
            bookingPercentage: bookingPercentage
          };
          events.push(parsedEvent);
        }
      });


      /* ---------- PART 2: INITIALIZE CALENDAR ---------- */
      const eventMap = {};
      events.forEach(evt => {
        eventMap[evt.link] = evt;
      });

      let initialDate = new Date();
      if (events.length > 0) {
        events.sort((a, b) => a.startDate - b.startDate);
        initialDate = events[0].startDate;
      }
      let currentDate = new Date(initialDate);
      currentDate.setDate(1);

      const months = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
      const grid = document.getElementById('calendar-grid');
      const disp = document.getElementById('calendar-month');
      const prevBtn = document.querySelector('.calendar-prev');
      const nextBtn = document.querySelector('.calendar-next');
      const airportDropdown = document.querySelector('.calendar-dropdown--airport');
      const airportLabel = airportDropdown.querySelector('.calendar-dropdown__label');
      const airportMenu = airportDropdown.querySelector('.calendar-dropdown__menu');
      let selectedAirportForFilter = 'all';

      const calendarWrapper = document.querySelector('.calendar-wrapper');
      const hint = document.createElement('div');
      hint.className = 'selection-hint';
      hint.textContent = 'Bitte zuerst Anreise wählen';
      airportDropdown.appendChild(hint);
      let hintHideTimer;
      airportDropdown.addEventListener('mouseover', () => {
        clearTimeout(hintHideTimer);
        hint.classList.remove('is-visible');
      });

      const popup = document.querySelector('.popup-here');
      let hidePopupTimer;
      const overlay = document.createElement('div');
      overlay.className = 'popup-overlay';
      document.body.appendChild(overlay);
      if (popup) {
        popup.addEventListener('mouseenter', () => clearTimeout(hidePopupTimer));
        popup.addEventListener('mouseleave', () => hidePopup());
      }
      overlay.addEventListener('click', () => hidePopup());

      /* ---------- PART 3: HELPER FUNCTIONS ---------- */
      function populateAirportFilter() {
        airportMenu.innerHTML = '';
        const makeItem = (text, value) => {
          const li = document.createElement('li');
          li.className = 'calendar-dropdown__item';
          li.textContent = text;
          li.dataset.airport = value;
          airportMenu.appendChild(li);
        };
        makeItem('Wähle deine Anreise', 'all');
        makeItem('Eigene Anreise', 'null');
        const sortedAirports = Array.from(availableAirports.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name));
        sortedAirports.forEach(([id, airportData]) => {
          makeItem(airportData.name, id);
        });
        airportLabel.textContent = 'Wähle deine Anreise';
      }

      function showPopup(evtData, event) {
        if (!popup) return;
        clearTimeout(hidePopupTimer);

        const titleEl = popup.querySelector('#title-event');
        const dateEl = popup.querySelector('#date-event');
        const daysEl = popup.querySelector('#days-driving');
        const costEl = popup.querySelector('#event-cost');
        const bookLink = popup.querySelector('.button.is-icon');
        const modelPopupEl = popup.querySelector('.porsche-modell');
        const kuerzelEl = popup.querySelector('.flg-kuerzel');
        const kuerzelContainer = kuerzelEl ? kuerzelEl.closest('.flex-calendar') : null;

        const percentContainer = popup.querySelector('.hide-for-now');
        const percentBlock = popup.querySelector('.block-percent-booked');

        const isKatschberg = evtData.location.toLowerCase().includes('katschberg');
        let finalSelectedAirport = selectedAirportForFilter;
        if (isKatschberg && selectedAirportForFilter === 'all') {
          finalSelectedAirport = 'null';
        }

        if (evtData.fullyBooked) {
          bookLink.textContent = 'Zur Warteliste';
          const waitlistUrl = new URL('/warteliste-event', window.location.origin);
          waitlistUrl.searchParams.set('event_id', evtData.id);
          waitlistUrl.searchParams.set('event_name', evtData.name);
          waitlistUrl.searchParams.set('event_location', evtData.location);
          waitlistUrl.searchParams.set('event_start_date', toISODateString(evtData.startDate));
          waitlistUrl.searchParams.set('event_end_date', toISODateString(evtData.endDate));
          bookLink.href = waitlistUrl.toString();
          bookLink.style.opacity = '';
          bookLink.style.pointerEvents = '';
          bookLink.style.cursor = 'pointer';
        } else {
          bookLink.textContent = 'info & booking';
          if (finalSelectedAirport === 'all') {
            bookLink.style.opacity = '0.5';
            bookLink.style.pointerEvents = 'none';
            bookLink.style.cursor = 'not-allowed';
            bookLink.removeAttribute('href');
          } else {
            bookLink.style.opacity = '';
            bookLink.style.pointerEvents = '';
            bookLink.style.cursor = '';
            const destinationUrl = new URL(evtData.link, window.location.origin);
            const airportInfo = availableAirports.get(finalSelectedAirport);
            const airportName = airportInfo ? airportInfo.name : (finalSelectedAirport === 'null' ? 'Eigene Anreise' : '');
            destinationUrl.searchParams.set('airport_id', finalSelectedAirport);
            if (airportName) {
              destinationUrl.searchParams.set('airport_name', airportName);
            }
            bookLink.href = destinationUrl.toString();
          }
        }

        if (kuerzelEl && kuerzelContainer) {
          const eventKuerzels = evtData.airports.map(airport => airport.kuerzel).filter(k => k);
          if (eventKuerzels.length > 0) {
            kuerzelEl.textContent = eventKuerzels.join(' / ');
            kuerzelContainer.style.display = 'flex';
          } else {
            kuerzelContainer.style.display = 'none';
          }
        }

        titleEl.textContent = evtData.location;
        const opts = {
          day: '2-digit',
          month: '2-digit'
        };
        const start = evtData.startDate.toLocaleDateString('de-DE', opts);
        const end = evtData.endDate.toLocaleDateString('de-DE', opts);
        dateEl.textContent = `${start} – ${end}`;
        daysEl.textContent = evtData.drivingDays !== null ? `${evtData.drivingDays} Fahrtage` : 'Fahrtage auf Anfrage';
        costEl.textContent = evtData.cost !== null ? `ab ${evtData.cost.toLocaleString('de-DE')} €` : 'Preis auf Anfrage';
        if (modelPopupEl) {
          modelPopupEl.innerHTML = evtData.models ? `Bereitstellung versch. <br>${evtData.models}` : 'Bereitstellung versch.<br>Porsche Fahrzeugmodelle';
        }

        // =======================================================
        // START: NEW LOGIC FOR BOOKING PERCENTAGE DISPLAY
        // =======================================================
        const bookedPercentage = evtData.bookingPercentage;

        if (percentContainer && percentBlock && bookedPercentage !== null && bookedPercentage >= 75) {
          let htmlContent = '';
          let labelText = '';

          if (bookedPercentage === 100) {
            labelText = 'ausverkauft, auf die Warteliste';
            htmlContent = `
                            <div style="width: 100%; font-family: sans-serif;">
                                <div style="height: 8px; background-color: #F3F4F6; border-radius: 4px; overflow: hidden; margin-bottom: 8px;">
                                    <div style="width: ${bookedPercentage}%; height: 100%; background-color: #3B82F6; transition: width 0.5s ease;"></div>
                                </div>
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; text-align: left;">
                                    <div>
                                        <div style="font-size: 14px; font-weight: 700; color: #1F2937; line-height: 1.2;">${bookedPercentage}%</div>
                                        <div style="font-size: 11px; color: #6B7280; text-transform: uppercase; letter-spacing: 0.5px;">${labelText}</div>
                                    </div>
                                </div>
                            </div>
                        `;
          } else if (bookedPercentage >= 85) {
            labelText = 'Fast ausverkauft';
            htmlContent = `
                            <div style="width: 100%; font-family: sans-serif;">
                                <div style="height: 8px; background-color: #F3F4F6; border-radius: 4px; overflow: hidden; margin-bottom: 8px;">
                                    <div style="width: ${bookedPercentage}%; height: 100%; background-color: #3B82F6; transition: width 0.5s ease;"></div>
                                </div>
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; text-align: left;">
                                    <div>
                                        <div style="font-size: 14px; font-weight: 700; color: #1F2937; line-height: 1.2;">${bookedPercentage}%</div>
                                        <div style="font-size: 11px; color: #6B7280; text-transform: uppercase; letter-spacing: 0.5px;">${labelText}</div>
                                    </div>
                                </div>
                            </div>
                        `;
          } else { // This covers 75% to 84%
            labelText = 'nur noch wenige Plätze frei';
            htmlContent = `
                            <div style="width: 100%; font-family: sans-serif; text-align: left;">
                                <div style="font-size: 12px; font-weight: 600; color: #1F2937;">${labelText}</div>
                            </div>
                        `;
          }

          percentBlock.innerHTML = htmlContent;
          percentContainer.style.display = 'block';

        } else if (percentContainer) {
          // Hide for percentages below 75% or if data is not available
          percentContainer.style.display = 'none';
        }
        // =======================================================
        // END: NEW LOGIC
        // =======================================================

        if (window.innerWidth > 640) {
          const targetElement = event.target;
          const eventRect = targetElement.getBoundingClientRect();
          popup.classList.remove('is-modal');
          popup.style.display = 'block';
          let top = window.scrollY + eventRect.bottom + 5;
          let left = window.scrollX + eventRect.left;
          if (left + popup.offsetWidth > window.innerWidth) {
            left = window.scrollX + eventRect.right - popup.offsetWidth;
          }
          if (top + popup.offsetHeight > document.documentElement.scrollHeight) {
            top = window.scrollY + eventRect.top - popup.offsetHeight - 5;
          }
          popup.style.left = `${left}px`;
          popup.style.top = `${top}px`;
        } else {
          popup.classList.add('is-modal');
          popup.style.left = '';
          popup.style.top = '';
          popup.style.display = 'block';
          overlay.style.display = 'block';
        }
      }

      function hidePopup() {
        if (popup.classList.contains('is-modal')) {
          popup.style.display = 'none';
          overlay.style.display = 'none';
        } else {
          hidePopupTimer = setTimeout(() => {
            if (popup) popup.style.display = 'none';
          }, 300);
        }
      }

      function toISODateString(date) {
        const y = date.getFullYear();
        const m = (date.getMonth() + 1).toString().padStart(2, '0');
        const d = date.getDate().toString().padStart(2, '0');
        return `${y}-${m}-${d}`;
      }

      function renderCal() {
        if (selectedAirportForFilter === 'all') {
          calendarWrapper.classList.add('needs-selection');
        } else {
          calendarWrapper.classList.remove('needs-selection');
        }
        disp.textContent = `${months[currentDate.getMonth()]}, ${currentDate.getFullYear()}`;
        grid.innerHTML = '';
        const y = currentDate.getFullYear();
        const m = currentDate.getMonth();
        const firstDayOfMonth = new Date(y, m, 1);
        const lastDayOfMonth = new Date(y, m + 1, 0);
        let dayOffset = firstDayOfMonth.getDay() === 0 ? 6 : firstDayOfMonth.getDay() - 1;
        const days = [];
        const prevLastDate = new Date(y, m, 0).getDate();
        for (let i = dayOffset; i > 0; i--) days.push({
          date: null,
          grayed: true,
          dayNum: prevLastDate - i + 1
        });
        for (let d = 1; d <= lastDayOfMonth.getDate(); d++) days.push({
          date: new Date(y, m, d),
          grayed: false,
          dayNum: d
        });
        const gridCells = Math.ceil(days.length / 7) * 7;
        while (days.length < gridCells) days.push({
          date: null,
          grayed: true,
          dayNum: days.length - lastDayOfMonth.getDate() - dayOffset + 1
        });

        days.forEach(obj => {
          const cell = document.createElement('div');
          cell.className = 'calendar-cell' + (obj.grayed ? ' calendar-cell--grayed' : '');
          cell.innerHTML = `<div class="calendar-cell__date">${obj.dayNum}</div><div class="calendar-events-container"></div>`;
          if (obj.date) cell.dataset.date = toISODateString(obj.date);
          grid.appendChild(cell);
        });

        const showAll = ['all', 'null'];
        const relevant = events.filter(ev => showAll.includes(selectedAirportForFilter) || ev.airports.some(a => a.id === selectedAirportForFilter));

        for (let i = 0; i < days.length; i += 7) {
          const weekDays = days.slice(i, i + 7).filter(d => d.date);
          if (!weekDays.length) continue;
          const weekStart = weekDays[0].date;
          const weekEnd = weekDays[weekDays.length - 1].date;
          const eventsInWeek = relevant.filter(ev => ev.startDate <= weekEnd && ev.endDate >= weekStart).sort((a, b) => a.startDate - b.startDate);

          const tracks = [];
          eventsInWeek.forEach(ev => {
            let t = 0;
            while (tracks[t] && tracks[t].some(ex => ev.startDate <= ex.endDate && ev.endDate >= ex.startDate)) t++;
            if (!tracks[t]) tracks[t] = [];
            tracks[t].push(ev);

            weekDays.forEach((dObj, idx) => {
              if (dObj.date < ev.startDate || dObj.date > ev.endDate) return;
              const cell = grid.querySelector(`[data-date="${toISODateString(dObj.date)}"]`);
              const holder = cell.querySelector('.calendar-events-container');

              const link = document.createElement('a');
              link.className = 'calendar-event';
              link.dataset.eventLink = ev.link;
              link.style.top = (t * 36) + 'px';
              link.style.height = '32px';

              const isActualStart = dObj.date.getTime() === ev.startDate.getTime();
              const isActualEnd = dObj.date.getTime() === ev.endDate.getTime();
              const isLastDayOfWeek = dObj.date.getDay() === 0;
              const isMobile = window.innerWidth <= 640;

              if (isActualStart && isActualEnd) {
                link.classList.add('event-start', 'event-end');
              } else if (isActualStart) {
                link.classList.add('event-start');
              } else if (isActualEnd) {
                link.classList.add('event-end');
              } else if (isLastDayOfWeek && !isMobile) {
                link.classList.add('event-end');
              } else {
                link.classList.add('event-middle');
              }

              // =======================================================
              // START: MODIFIED SECTION FOR MOBILE TEXT DISPLAY LOGIC
              // =======================================================
              const getFlag = (location) => {
                if (location.toLowerCase().includes('lappland')) return '🇸🇪';
                if (location.toLowerCase().includes('katschberg')) return '🇦🇹';
                return '';
              };

              const flag = getFlag(ev.location);
              const isSunday = dObj.date.getDay() === 0;
              const eventStartedOnSunday = ev.startDate.getDay() === 0;
              const isDayAfterStart = dObj.date.getTime() === ev.startDate.getTime() + 86400000;

              if (ev.fullyBooked) {
                link.classList.add('fully-booked');
                link.style.cursor = 'pointer';
                link.style.opacity = '0.6';

                if (isMobile) {
                  if (isActualStart && isSunday) {
                    link.innerHTML = flag; // Sunday start: Flag only
                    link.classList.add('mobile-flag-only');
                  } else if (isActualStart) { // Normal start day
                    link.innerHTML = `${flag} AUSGEBUCHT`; // CHANGED: Removed location
                    link.classList.add('mobile-text-start');
                  } else if (eventStartedOnSunday && isDayAfterStart) { // Monday after Sunday start
                    link.innerHTML = `AUSGEBUCHT`; // CHANGED: Removed location
                    link.classList.add('mobile-text-start');
                  }
                } else { // Desktop logic
                  if (isActualStart) {
                    const displayText = flag ? `${flag} ${ev.location}` : ev.location;
                    const pillHTML = `<span style="display: inline-block; margin-left: 8px; padding: 2px 8px; font-size: 10px; font-weight: 600; background-color: #e5e7eb; color: #4b5563; border-radius: 12px; vertical-align: middle;">AUSGEBUCHT</span>`;
                    link.innerHTML = displayText + pillHTML;
                  }
                }
              } else { // --- Event is NOT fully booked
                if (isMobile) {
                  if (isActualStart && isActualEnd) { // ADDED: Handle single-day events
                    link.innerHTML = flag;
                    link.classList.add('mobile-flag-only');
                  } else if (isActualStart && isSunday) {
                    link.innerHTML = flag; // Sunday start: Flag only
                    link.classList.add('mobile-flag-only');
                  } else if (isActualStart) { // Normal start day for multi-day events
                    link.innerHTML = `${flag} ${ev.location}`;
                    link.classList.add('mobile-text-start');
                  } else if (eventStartedOnSunday && isDayAfterStart) { // Monday after Sunday start
                    link.innerHTML = ev.location;
                    link.classList.add('mobile-text-start');
                  }
                } else { // Desktop logic
                  if (isActualStart) {
                    const displayText = flag ? `${flag} ${ev.location}` : ev.location;
                    link.textContent = displayText;
                  }
                }

                // This logic remains to handle clickability
                const isKatschberg = ev.location.toLowerCase().includes('katschberg');
                const selectionMade = selectedAirportForFilter !== 'all';
                const isActive = isKatschberg || selectionMade;

                if (isActive) {
                  link.href = ev.link;
                  link.classList.add(`status--${ev.status.toLowerCase().replace(/\s+/g, '-')}`);
                  link.style.cursor = 'pointer';
                } else {
                  link.classList.add('is-disabled');
                  link.style.cursor = 'not-allowed';
                }
              }
              // =====================================================
              // END: MODIFIED SECTION
              // =====================================================

              if (window.innerWidth > 640) {
                link.addEventListener('mouseenter', (e) => showPopup(ev, e));
                link.addEventListener('mouseleave', () => hidePopup());
              }

              holder.appendChild(link);
            });
          });
        }
      }

      /* ---------- PART 4: EVENT LISTENERS ---------- */
      const changeMonth = offset => {
        currentDate.setMonth(currentDate.getMonth() + offset);
        renderCal();
      };
      prevBtn.addEventListener('click', () => changeMonth(-1));
      nextBtn.addEventListener('click', () => changeMonth(1));

      document.querySelectorAll('[data-dropdown]').forEach(dd => {
        const trigger = dd.querySelector('.calendar-dropdown__trigger');
        const menu = dd.querySelector('.calendar-dropdown__menu');
        trigger.addEventListener('click', e => {
          e.stopPropagation();
          document.querySelectorAll('[data-dropdown].open').forEach(o => {
            if (o !== dd) o.classList.remove('open');
          });
          dd.classList.toggle('open');
        });
        menu.addEventListener('click', e => {
          if (!e.target.classList.contains('calendar-dropdown__item')) return;
          const item = e.target;
          const label = dd.querySelector('.calendar-dropdown__label');
          label.textContent = item.textContent.trim();
          dd.classList.remove('open');
          if (dd.classList.contains('calendar-dropdown--airport')) {
            const airportId = item.dataset.airport;
            selectedAirportForFilter = airportId;

            if (airportId === 'all') {
              localStorage.removeItem('selectedAirportId');
              localStorage.removeItem('selectedAirportName');
            } else {
              localStorage.setItem('selectedAirportId', airportId);
              const airportName = item.textContent.trim();
              localStorage.setItem('selectedAirportName', airportName);
            }
          }
          if (dd.classList.contains('calendar-dropdown--month')) {
            currentDate.setMonth(parseInt(item.dataset.month, 10));
          }
          renderCal();
        });
      });

      grid.addEventListener('click', e => {
        const eventLink = e.target.closest('a.calendar-event');
        if (!eventLink) return;

        const eventId = eventLink.dataset.eventLink;
        const eventData = eventMap[eventId];
        if (!eventData) return;

        if (eventData.fullyBooked) {
          e.preventDefault();
          showPopup(eventData, e);
          return;
        }

        const isKatschberg = eventData.location.toLowerCase().includes('katschberg');
        let finalSelectedAirport = selectedAirportForFilter;

        if (isKatschberg && selectedAirportForFilter === 'all') {
          finalSelectedAirport = 'null';
        }

        const isActive = isKatschberg || selectedAirportForFilter !== 'all';

        if (isActive && window.innerWidth > 640) {
          e.preventDefault();
          const destinationUrl = new URL(eventData.link, window.location.origin);

          if (finalSelectedAirport && finalSelectedAirport !== 'all') {
            const airportInfo = availableAirports.get(finalSelectedAirport);
            const airportName = airportInfo ? airportInfo.name : (finalSelectedAirport === 'null' ? 'Eigene Anreise' : '');

            destinationUrl.searchParams.set('airport_id', finalSelectedAirport);
            if (airportName) {
              destinationUrl.searchParams.set('airport_name', airportName);
            }
          }
          window.location.href = destinationUrl.toString();
          return;
        }

        if (isActive && window.innerWidth <= 640) {
          e.preventDefault();
          showPopup(eventData, e);
          return;
        }

        if (!isActive) {
          e.preventDefault();
          if (airportDropdown) {
            airportDropdown.scrollIntoView({
              behavior: 'smooth',
              block: 'center'
            });
            airportDropdown.classList.add('is-shaking');
            if (hint) {
              hint.classList.add('is-visible');
              clearTimeout(hintHideTimer);
              hintHideTimer = setTimeout(() => hint.classList.remove('is-visible'), 3000);
            }
            setTimeout(() => airportDropdown.classList.remove('is-shaking'), 700);
          }
        }
      });

      grid.addEventListener('mouseover', e => {
        const eventLink = e.target.closest('.calendar-event');
        if (!eventLink) return;

        const eventId = eventLink.dataset.eventLink;
        if (!eventId) return;

        const eventData = eventMap[eventId];
        if (!eventData) return;

        grid.querySelectorAll(`.calendar-event[data-event-link="${CSS.escape(eventId)}"]`).forEach(el => el.classList.add('is-hovered'));

        if (eventData.fullyBooked) return;

        const isKatschberg = eventData.location.toLowerCase().includes('katschberg');
        const needsAirportSelection = calendarWrapper.classList.contains('needs-selection');

        if (!isKatschberg && needsAirportSelection) {
          airportDropdown.classList.add('is-shaking');
          hint.classList.add('is-visible');
          clearTimeout(hintHideTimer);
          hintHideTimer = setTimeout(() => hint.classList.remove('is-visible'), 3000);
          setTimeout(() => airportDropdown.classList.remove('is-shaking'), 700);
        }
      });

      grid.addEventListener('mouseout', e => {
        const eventLink = e.target.closest('.calendar-event');
        if (!eventLink) return;
        const eventId = eventLink.dataset.eventLink;
        if (eventId) {
          grid.querySelectorAll(`.calendar-event[data-event-link="${CSS.escape(eventId)}"]`).forEach(el => el.classList.remove('is-hovered'));
        }
      });

      /* ---------- PART 5: SCRIPT INITIALIZATION ---------- */
      populateAirportFilter();
      renderCal();
      window.addEventListener('resize', () => renderCal());
    }

    initializeCalendar();
  });