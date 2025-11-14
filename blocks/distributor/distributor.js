import { isAuthor } from '../../scripts/aem.js';
import { getAccessToken } from '../../scripts/oauth.js';
import { forgeRockConfig } from '../../scripts/config.js';

  export default async function decorate(block) {
    if (!(window.location.origin.includes('localhost') || isAuthor)) {
    function formatPhoneNumber(num) {
      const str = String(num || '');
      return str.length >= 4 ? `${str.slice(0, 4)} ${str.slice(4, 7)} ${str.slice(7)}` : str;
    }

    try {
      const config = await forgeRockConfig();
      const accessToken = await getAccessToken();
      const response = await fetch(`${config.app.environment}/bin/dealerinfo.json`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) throw new Error('Failed to fetch dealer info');
      const dealerResponse = await response.json();

      const dealers = dealerResponse.dealers || [];
      const userInfo = dealerResponse.user || {};

      const responseBusiness = await fetch(`${window.hlx.codeBasePath}/business-hours.json`);
      const businessResponse = await responseBusiness.json();
      const businessData = businessResponse.data?.[0] || {};

      // --- Clear block content ---
      block.innerHTML = '';

      const dealerDiv = document.createElement('div');
      dealerDiv.classList.add('dealer-details');
      block.appendChild(dealerDiv);

      function createCallWrapper(selectedDealer) {
        const dealerRepsContactNumber = selectedDealer.bdm_phone || '';
        const customerContactNumber = businessData['Customer Contact Number'] || '';
        const businessHours = businessData['Business Hours'] || '';
        const businessHoursbr = businessHours.replace(/,\s*/g, '<br>');

        const callWrapper = document.createElement('div');
        callWrapper.classList.add('call-wrapper');
        callWrapper.innerHTML = `
        <p><strong>Your BDM:</strong> ${selectedDealer.bdm_name || '-'}</p>
        <div class="call-icon-details-wrapper">
          <img
            class="call-icon"
            src="${window.hlx.codeBasePath}/icons/call.svg"
            alt="Call Icon"
          />
          <div class="call-details">
            <p><strong>Dealer Reps only: ${formatPhoneNumber(dealerRepsContactNumber)}</strong></p>
            <p>Customers: ${formatPhoneNumber(customerContactNumber)}</p>
            <p class="opening-time">${businessHoursbr}</p>
          </div>
        </div>
      `;

        // Toggle details visibility
        const callIcon = callWrapper.querySelector('.call-icon');
        const callDetails = callWrapper.querySelector('.call-details');

        if (callIcon && callDetails) {
          callIcon.addEventListener('click', (event) => {
            event.stopPropagation();
            callIcon.classList.toggle('icon-border');
            callDetails.classList.toggle('expanded');
          });

          document.addEventListener('click', (event) => {
            if (!callIcon.contains(event.target) && !callDetails.contains(event.target)) {
              callIcon.classList.remove('icon-border');
              callDetails.classList.remove('expanded');
            }
          });
          callDetails.addEventListener('click', (event) => event.stopPropagation());
        }

        return callWrapper;
      }

      // --- Render dealer row ---
      function renderDealerRow(selectedDealer, isDropdown = false, dropdownEl = null) {
        dealerDiv.innerHTML = ''; // clear

        const left = document.createElement('div');
        left.classList.add('dealer-left');

        if (isDropdown) {
          const label = document.createElement('label');
          label.setAttribute('for', 'dealerSelect');
          label.textContent = 'CIL Distributor: ';
          left.appendChild(label);
          left.appendChild(dropdownEl);
        } else {
          left.innerHTML = `<p><strong>CIL Distributor:</strong> ${selectedDealer.distributor_name}</p>`;
        }

        const center = document.createElement('p');
        center.classList.add('agent-number');
        center.innerHTML = `<strong>Agent number:</strong> ${selectedDealer.agent_id || '-'}`;

        const right = createCallWrapper(selectedDealer);

        dealerDiv.appendChild(left);
        dealerDiv.appendChild(center);
        dealerDiv.appendChild(right);
      }

      // --- Handle single dealer ---
      if (dealers.length === 1) {
        renderDealerRow(dealers[0]);
        return;
      }

      // --- Multiple dealers: Dropdown ---
      const dropdown = document.createElement('select');
      dropdown.id = 'dealerSelect';
      dropdown.innerHTML = `<option value="">-- Select Distributor --</option>`;

      dealers.forEach((dealer) => {
        const option = document.createElement('option');
        option.value = dealer.agent_id;
        option.textContent = dealer.distributor_name;
        dropdown.appendChild(option);
      });

      // Initial placeholder
      renderDealerRow({
        distributor_name: '',
        agent_id: '',
        bdm_name: '',
        bdm_phone: ''
      }, true, dropdown);

      // Handle selection
      dropdown.addEventListener('change', (event) => {
        const selectedId = event.target.value;
        const selectedDealer = dealers.find((d) => d.agent_id === selectedId);
        if (!selectedDealer) return;
        renderDealerRow(selectedDealer, true, dropdown);
      });

    } catch (error) {
      console.error('Error loading dealer details:', error);
      block.innerHTML = `<p style="color:red;">Failed to load distributor details.</p>`;
    }
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    const block = document.querySelector('.distributor.block');
    if (block) {
      decorate(block);
    } else {
      console.warn('Distributor block not found!');
    }
  });
