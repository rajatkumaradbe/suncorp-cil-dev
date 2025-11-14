export default async function decorate(block) {
  const [cilHomeTextDiv, cilHomeUrlDiv, cilPrivacyTextDiv, cilPrivacyUrlDiv] = block.querySelectorAll(':scope > div');

  const cilHomeText = cilHomeTextDiv?.textContent?.trim() || 'CIL Caravan and RV Insurance';
  const cilHomeUrl = cilHomeUrlDiv?.textContent?.trim() || '#';
  const cilPrivacyText = cilPrivacyTextDiv?.textContent?.trim() || 'Privacy Statement';
  const cilPrivacyUrl = cilPrivacyUrlDiv?.textContent?.trim() || '#';

  const container = document.createElement('div');
  container.classList.add('custom-footer-container');

  const homeLink = document.createElement('a');
  homeLink.textContent = cilHomeText;
  homeLink.href = cilHomeUrl;
  homeLink.classList.add('custom-footer-link');

  const privacyLink = document.createElement('a');
  privacyLink.textContent = cilPrivacyText;
  privacyLink.href = cilPrivacyUrl;
  privacyLink.classList.add('custom-footer-link');

  container.appendChild(homeLink);
  container.appendChild(document.createTextNode(' | '));
  container.appendChild(privacyLink);

  block.innerHTML = '';
  block.appendChild(container);
}
