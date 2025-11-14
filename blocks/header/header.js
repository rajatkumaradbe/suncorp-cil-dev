import { doLogout } from '../../scripts/session.js';

export default async function decorate(block) {
  const imgUrl = `${window.hlx.codeBasePath}/icons/cil-logo.svg`;
  block.innerHTML = `
<div class='custom-header'>
<div class='header-logo'>
<div>
<a href = 'https://www.cilinsurance.com.au/' target='_blank'>
<img src = '${imgUrl}' alt = 'headerImg' class = 'custom-header-image'
/></a>
</div>
<p><a id="logout" href="#" class="logout-link">Logout</a></p>
</div>
</div>`;

  document.getElementById('logout').addEventListener('click', async (e) => {
    e.preventDefault();
    await doLogout();
    window.location.reload();
  });
}
