import {
  createButton,
  createFieldWrapper,
  createLabel,
  getHTMLRenderType,
  createHelpText,
  getId,
  stripTags,
  checkValidation,
  toClassName,
} from './util.js';
import GoogleReCaptcha from './integrations/recaptcha.js';
import componentDecorator from './mappings.js';
import DocBasedFormToAF from './transform.js';
import transferRepeatableDOM, {
  insertAddButton,
  insertRemoveButton,
} from './components/repeat/repeat.js';
import { handleSubmit } from './submit.js';
import { getSubmitBaseUrl, emailPattern } from './constant.js';

export const DELAY_MS = 0;
let captchaField;
let afModule;

const withFieldWrapper = (element) => (fd) => {
  const wrapper = createFieldWrapper(fd);
  wrapper.append(element(fd));
  return wrapper;
};

function setPlaceholder(element, fd) {
  if (fd.placeholder) {
    element.setAttribute('placeholder', fd.placeholder);
  }
}

const constraintsDef = Object.entries({
  'password|tel|email|text': [
    ['maxLength', 'maxlength'],
    ['minLength', 'minlength'],
    'pattern',
  ],
  'number|range|date': [['maximum', 'Max'], ['minimum', 'Min'], 'step'],
  file: ['accept', 'Multiple'],
  panel: [
    ['maxOccur', 'data-max'],
    ['minOccur', 'data-min'],
  ],
}).flatMap(([types, constraintDef]) =>
  types
    .split('|')
    .map((type) => [
      type,
      constraintDef.map((cd) => (Array.isArray(cd) ? cd : [cd, cd])),
    ]),
);

const constraintsObject = Object.fromEntries(constraintsDef);

function setConstraints(element, fd) {
  const renderType = getHTMLRenderType(fd);
  const constraints = constraintsObject[renderType];
  if (constraints) {
    constraints
      .filter(([nm]) => fd[nm])
      .forEach(([nm, htmlNm]) => {
        element.setAttribute(htmlNm, fd[nm]);
      });
  }
}

function createInput(fd) {
  const input = document.createElement('input');
  input.type = getHTMLRenderType(fd);
  setPlaceholder(input, fd);
  setConstraints(input, fd);
  return input;
}

const createTextArea = withFieldWrapper((fd) => {
  const input = document.createElement('textarea');
  setPlaceholder(input, fd);
  return input;
});

const createSelect = withFieldWrapper((fd) => {
  const select = document.createElement('select');
  select.required = fd.required;
  select.title = fd.tooltip ? stripTags(fd.tooltip, '') : '';
  select.readOnly = fd.readOnly;
  select.multiple =
    fd.type === 'string[]' || fd.type === 'boolean[]' || fd.type === 'number[]';
  let ph;
  if (fd.placeholder) {
    ph = document.createElement('option');
    ph.textContent = fd.placeholder;
    ph.setAttribute('disabled', '');
    ph.setAttribute('value', '');
    select.append(ph);
  }
  let optionSelected = false;

  const addOption = (label, value) => {
    const option = document.createElement('option');
    option.textContent =
      label instanceof Object ? label?.value?.trim() : label?.trim();
    option.value =
      (typeof value === 'string' ? value.trim() : value) || label?.trim();
    if (
      fd.value === option.value ||
      (Array.isArray(fd.value) && fd.value.includes(option.value))
    ) {
      option.setAttribute('selected', '');
      optionSelected = true;
    }
    select.append(option);
    return option;
  };

  const options = fd?.enum || [];
  const optionNames = fd?.enumNames ?? options;

  if (options.length === 1 && options?.[0]?.startsWith('https://')) {
    const optionsUrl = new URL(options?.[0]);
    // using async to avoid rendering
    if (
      optionsUrl.hostname.endsWith('hlx.page') ||
      optionsUrl.hostname.endsWith('hlx.live')
    ) {
      fetch(`${optionsUrl.pathname}${optionsUrl.search}`).then(
        async (response) => {
          const json = await response.json();
          const values = [];
          json.data.forEach((opt) => {
            addOption(opt.Option, opt.Value);
            values.push(opt.Value || opt.Option);
          });
        },
      );
    }
  } else {
    options.forEach((value, index) => addOption(optionNames?.[index], value));
  }

  if (ph && optionSelected === false) {
    ph.setAttribute('selected', '');
  }
  // wrap select in a div for styling
  const wrapper = document.createElement('div');
  wrapper.classList.add('select-wrapper');
  wrapper.append(select);
  return wrapper;
});

function createHeading(fd) {
  const wrapper = createFieldWrapper(fd);
  const heading = document.createElement('h2');
  heading.textContent = fd.value || fd.label.value;
  heading.id = fd.id;
  wrapper.append(heading);

  return wrapper;
}

function createRadioOrCheckbox(fd) {
  const wrapper = createFieldWrapper(fd);
  const input = createInput(fd);
  const [value, uncheckedValue] = fd.enum || [];
  input.value = value;
  if (typeof uncheckedValue !== 'undefined') {
    input.dataset.uncheckedValue = uncheckedValue;
  }
  wrapper.insertAdjacentElement('afterbegin', input);
  return wrapper;
}

function createLegend(fd) {
  return createLabel(fd, 'legend');
}

function createRepetablePanel(wrapper, fd) {
  setConstraints(wrapper, fd);
  wrapper.dataset.repeatable = true;
  wrapper.dataset.index = fd.index || 0;
  if (fd.properties) {
    Object.keys(fd.properties).forEach((key) => {
      if (!key.startsWith('fd:')) {
        wrapper.dataset[key] = fd.properties[key];
      }
    });
  }
  if (!fd.index || fd?.index === 0) {
    insertAddButton(wrapper, wrapper);
    insertRemoveButton(wrapper, wrapper);
  }
}
function createFieldSet(fd) {
  const wrapper = createFieldWrapper(fd, 'fieldset', createLegend);
  wrapper.id = fd.id;
  wrapper.name = fd.name;
  if (fd.fieldType === 'panel') {
    wrapper.classList.add('panel-wrapper');
  }
  if (fd.repeatable === true) {
    createRepetablePanel(wrapper, fd);
  }
  return wrapper;
}

function setConstraintsMessage(field, messages = {}) {
  Object.keys(messages).forEach((key) => {
    field.dataset[`${key}ErrorMessage`] = messages[key];
  });
}

function createRadioOrCheckboxGroup(fd) {
  const wrapper = createFieldSet({ ...fd });
  const type = fd.fieldType.split('-')[0];
  fd.enum.forEach((value, index) => {
    const label =
      typeof fd.enumNames?.[index] === 'object' &&
      fd.enumNames?.[index] !== null
        ? fd.enumNames[index].value
        : fd.enumNames?.[index] || value;
    const id = getId(fd.name);
    const field = createRadioOrCheckbox({
      name: fd.name,
      id,
      label: { value: label },
      fieldType: type,
      enum: [value],
      required: fd.required,
    });
    field.classList.remove('field-wrapper', `field-${toClassName(fd.name)}`);
    const input = field.querySelector('input');
    input.id = id;
    input.dataset.fieldType = fd.fieldType;
    input.name = fd.name;
    input.checked = Array.isArray(fd.value)
      ? fd.value.includes(value)
      : value === fd.value;
    if (type === 'checkbox') {
      input.name = input.id;
    }
    if ((index === 0 && type === 'radio') || type === 'checkbox') {
      input.required = fd.required;
    }
    if (fd.enabled === false || fd.readOnly === true) {
      input.setAttribute('disabled', 'disabled');
    }
    wrapper.appendChild(field);
  });
  wrapper.dataset.required = fd.required;
  if (fd.tooltip) {
    wrapper.title = stripTags(fd.tooltip, '');
  }
  setConstraintsMessage(wrapper, fd.constraintMessages);
  return wrapper;
}

function createPlainText(fd) {
  const paragraph = document.createElement('p');
  if (fd.richText) {
    paragraph.innerHTML = stripTags(fd.value);
  } else {
    paragraph.textContent = fd.value;
  }
  const wrapper = createFieldWrapper(fd);
  wrapper.id = fd.id;
  wrapper.replaceChildren(paragraph);
  return wrapper;
}

function createImage(fd) {
  const field = createFieldWrapper(fd);
  const imagePath = fd.source || fd.properties['fd:repoPath'] || '';
  const image = `
  <picture>
    <source srcset="${imagePath}?width=2000&optimize=medium" media="(min-width: 600px)">
    <source srcset="${imagePath}?width=750&optimize=medium">
    <img alt="${
      fd.altText || fd.name
    }" src="${imagePath}?width=750&optimize=medium">
  </picture>`;
  field.innerHTML = image;
  return field;
}

const fieldRenderers = {
  'drop-down': createSelect,
  'plain-text': createPlainText,
  checkbox: createRadioOrCheckbox,
  button: createButton,
  multiline: createTextArea,
  panel: createFieldSet,
  radio: createRadioOrCheckbox,
  'radio-group': createRadioOrCheckboxGroup,
  'checkbox-group': createRadioOrCheckboxGroup,
  image: createImage,
  heading: createHeading,
};

function colSpanDecorator(field, element) {
  const colSpan = field['Column Span'] || field.properties?.colspan;
  if (colSpan && element) {
    element.classList.add(`col-${colSpan}`);
  }
}

function priceTotalDecorator(field, element) {
  const priceTotal = field.properties?.priceTotal;
  if (priceTotal && element) {
    element.classList.add('price-total');
  }
}

function lengthUnitsDecorator(field, element) {
  const lengthUnits = field.properties?.lengthUnits;
  if (lengthUnits && element) {
    element.classList.add('length-units');
  }
}
function yearOfManufactureDecorator(field, element) {
  const yearOfManufacture = field.properties?.yearOfManufacture;
  if (yearOfManufacture && element) {
    element.classList.add('manufacture-year');
  }
}
function dobCalcDecorator(field, element) {
  const dobCalc = field.properties?.dobCalc;
  if (dobCalc && element) {
    element.classList.add('dob-calc');
  }
}

function dateOfOwnership(field, element) {
  const dateOfOwnership = field.properties?.dateOfOwnership;
  if (dateOfOwnership && element) {
    element.classList.add('date-ownership');
  }
}

function multiSelectDecorator(field, element) {
  const multiSelect = field.properties?.multipleSelect;
  if (multiSelect && element) {
    element.classList.add('multi-select');
  }
}

function requiredfieldstoggle(field, element) {
  const requiredfieldstoggle = field.properties?.requiredfieldstoggle;
  if (requiredfieldstoggle && element) {
    element.classList.add('required-fields-toggle');
  }
}

function otherHelpText(field, element) {
  const otherHelpText = field.properties?.otherHelpText;
  if (otherHelpText && element) {
    element.classList.add('other-help-text');
  }
}

const handleFocus = (input, field) => {
  const editValue = input.getAttribute('edit-value');
  input.type = field.type;
  input.value = editValue;
};

const handleFocusOut = (input) => {
  const displayValue = input.getAttribute('display-value');
  input.type = 'text';
  input.value = displayValue;
};

function inputDecorator(field, element) {
  const input = element?.querySelector('input,textarea,select');
  if (input) {
    input.id = field.id;
    input.name = field.name;
    if (field.tooltip) {
      input.title = stripTags(field.tooltip, '');
    }
    input.readOnly = field.readOnly;
    input.autocomplete = field.autoComplete ?? 'off';
    input.disabled = field.enabled === false;
    if (field.fieldType === 'drop-down' && field.readOnly) {
      input.disabled = true;
    }
    const fieldType = getHTMLRenderType(field);
    if (
      ['number', 'date', 'text', 'email'].includes(fieldType) &&
      (field.displayFormat || field.displayValueExpression)
    ) {
      field.type = fieldType;
      input.setAttribute('edit-value', field.value ?? '');
      input.setAttribute('display-value', field.displayValue ?? '');
      input.type = 'text';
      input.value = field.displayValue ?? '';
      input.addEventListener('touchstart', () => {
        input.type = field.type;
      }); // in mobile devices the input type needs to be toggled before focus
      input.addEventListener('focus', () => handleFocus(input, field));
      input.addEventListener('blur', () => handleFocusOut(input));
    } else if (input.type !== 'file') {
      input.value = field.value ?? '';
      if (input.type === 'radio' || input.type === 'checkbox') {
        input.value = field?.enum?.[0] ?? 'on';
        input.checked = field.value === input.value;
      }
    } else {
      input.multiple = field.type === 'file[]';
    }
    if (field.required) {
      input.setAttribute('required', 'required');
    }
    if (field.description) {
      input.setAttribute('aria-describedby', `${field.id}-description`);
    }
    if (field.minItems) {
      input.dataset.minItems = field.minItems;
    }
    if (field.maxItems) {
      input.dataset.maxItems = field.maxItems;
    }
    if (field.maxFileSize) {
      input.dataset.maxFileSize = field.maxFileSize;
    }
    if (field.default !== undefined) {
      input.setAttribute('value', field.default);
    }
    if (input.type === 'email') {
      input.pattern = emailPattern;
    }
    setConstraintsMessage(element, field.constraintMessages);
    element.dataset.required = field.required;
  }
}

function renderField(fd) {
  const fieldType = fd?.fieldType?.replace('-input', '') ?? 'text';
  const renderer = fieldRenderers[fieldType];
  let field;
  if (typeof renderer === 'function') {
    field = renderer(fd);
  } else {
    field = createFieldWrapper(fd);
    field.append(createInput(fd));
  }
  if (fd.description) {
    field.append(createHelpText(fd));
    field.dataset.description = fd.description; // In case overriden by error message
  }
  if (fd.fieldType !== 'radio-group' && fd.fieldType !== 'checkbox-group') {
    inputDecorator(fd, field);
  }
  return field;
}

export async function generateFormRendition(
  panel,
  container,
  getItems = (p) => p?.items,
) {
  const items = getItems(panel) || [];
  const promises = items.map(async (field) => {
    field.value = field.value ?? '';
    const { fieldType } = field;
    if (fieldType === 'captcha') {
      captchaField = field;
    } else {
      const element = renderField(field);
      if (field.appliedCssClassNames) {
        element.className += ` ${field.appliedCssClassNames}`;
      }
      colSpanDecorator(field, element);
      priceTotalDecorator(field, element);
      lengthUnitsDecorator(field, element);
      multiSelectDecorator(field, element);
      otherHelpText(field, element);
      requiredfieldstoggle(field, element);
      dobCalcDecorator(field, element);
      dateOfOwnership(field, element);
      yearOfManufactureDecorator(field, element);
      if (field?.fieldType === 'panel') {
        await generateFormRendition(field, element, getItems);
        return element;
      }
      await componentDecorator(element, field, container);
      return element;
    }
    return null;
  });

  const children = await Promise.all(promises);
  container.append(...children.filter((_) => _ != null));
  await componentDecorator(container, panel);
}

function enableValidation(form) {
  form.querySelectorAll('input,textarea,select').forEach((input) => {
    input.addEventListener('invalid', (event) => {
      checkValidation(event.target);
    });
  });

  form.addEventListener('change', (event) => {
    checkValidation(event.target);
  });
}

async function createFormForAuthoring(formDef) {
  const form = document.createElement('form');
  await generateFormRendition(formDef, form, (container) => {
    if (container[':itemsOrder'] && container[':items']) {
      return container[':itemsOrder'].map(
        (itemKey) => container[':items'][itemKey],
      );
    }
    return [];
  });
  return form;
}

export async function createForm(formDef, data) {
  const { action: formPath } = formDef;
  const form = document.createElement('form');
  form.dataset.action = formPath;
  form.noValidate = true;
  if (formDef.appliedCssClassNames) {
    form.className = formDef.appliedCssClassNames;
  }
  await generateFormRendition(formDef, form);

  let captcha;
  if (captchaField) {
    const siteKey =
      captchaField?.properties?.['fd:captcha']?.config?.siteKey ||
      captchaField?.value;
    captcha = new GoogleReCaptcha(siteKey, captchaField.id);
    captcha.loadCaptcha(form);
  }

  enableValidation(form);
  transferRepeatableDOM(form);

  if (afModule) {
    window.setTimeout(async () => {
      afModule.loadRuleEngine(
        formDef,
        form,
        captcha,
        generateFormRendition,
        data,
      );
    }, DELAY_MS);
  }

  form.addEventListener('reset', async () => {
    const newForm = await createForm(formDef);
    document
      .querySelector(`[data-action="${formDef.action}"]`)
      .replaceWith(newForm);
  });

  form.addEventListener('submit', (e) => {
    handleSubmit(e, form, captcha);
  });

  return form;
}

function isDocumentBasedForm(formDef) {
  return formDef?.[':type'] === 'sheet' && formDef?.data;
}

function cleanUp(content) {
  const formDef = content.replaceAll(
    '^(([^<>()\\\\[\\\\]\\\\\\\\.,;:\\\\s@\\"]+(\\\\.[^<>()\\\\[\\\\]\\\\\\\\.,;:\\\\s@\\"]+)*)|(\\".+\\"))@((\\\\[[0-9]{1,3}\\\\.[0-9]{1,3}\\\\.[0-9]{1,3}\\\\.[0-9]{1,3}])|(([a-zA-Z\\\\-0-9]+\\\\.)\\+[a-zA-Z]{2,}))$',
    '',
  );
  return formDef?.replace(/\x83\n|\n|\s\s+/g, '');
}
/*
  Newer Clean up - Replace backslashes that are not followed by valid json escape characters
  function cleanUp(content) {
    return content.replace(/\\/g, (match, offset, string) => {
      const prevChar = string[offset - 1];
      const nextChar = string[offset + 1];
      const validEscapeChars = ['b', 'f', 'n', 'r', 't', '"', '\\'];
      if (validEscapeChars.includes(nextChar) || prevChar === '\\') {
        return match;
      }
      return '';
    });
  }
*/

function decode(rawContent) {
  const content = rawContent.trim();
  if (content.startsWith('"') && content.endsWith('"')) {
    // In the new 'jsonString' context, Server side code comes as a string with escaped characters,
    // hence the double parse
    return JSON.parse(JSON.parse(content));
  }
  return JSON.parse(cleanUp(content));
}

function extractFormDefinition(block) {
  let formDef;
  const container = block.querySelector('pre');
  const codeEl = container?.querySelector('code');
  const content = codeEl?.textContent;
  if (content) {
    formDef = decode(content);
  }
  return { container, formDef };
}

export async function fetchForm(pathname) {
  // get the main form
  let data;
  let path = pathname;
  if (path.startsWith(window.location.origin) && !path.endsWith('.json')) {
    if (path.endsWith('.html')) {
      path = path.substring(0, path.lastIndexOf('.html'));
    }
    path += '/jcr:content/root/section/form.html';
  }
  let resp = await fetch(path);

  if (resp?.headers?.get('Content-Type')?.includes('application/json')) {
    data = await resp.json();
  } else if (resp?.headers?.get('Content-Type')?.includes('text/html')) {
    resp = await fetch(path);
    data = await resp.text().then((html) => {
      try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        if (doc) {
          return extractFormDefinition(doc.body).formDef;
        }
        return doc;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(
          'Unable to fetch form definition for path',
          pathname,
          path,
        );
        return null;
      }
    });
  }
  return data;
}

export default async function decorate(block) {
  setTimeout(() => {
    const radioButtons1 = block.querySelectorAll(
      '.radio-group-wrapper input[type="radio"]',
    );

    radioButtons1.forEach(function (radio) {
      radio.addEventListener('change', function () {
        const labels = radio
          .closest('.radio-group-wrapper')
          .querySelectorAll('label');
        labels.forEach(function (label) {
          label.classList.remove('checked');
        });
        const label = radio.nextElementSibling;
        if (label) {
          label.classList.add('checked');
        }
      });
    });

    const checkboxGroups = block.querySelectorAll(
      '.checkbox-group-wrapper.multi-select',
    );

    if (checkboxGroups) {
      checkboxGroups.forEach(function (checkboxGroup) {
        const description = checkboxGroup.querySelector('.field-description');
        const checkboxes = checkboxGroup.querySelectorAll(
          'input[type="checkbox"]',
        );

        checkboxes.forEach(function (checkbox) {
          checkbox.removeAttribute('required');
        });

        checkboxes.forEach((checkbox) => {
          checkbox.addEventListener('change', function () {
            // Only set textContent if description is not null
            if (description) {
              description.textContent = ''; // Or set it to whatever message you want
            }
            checkboxGroup.classList.remove('field-invalid');
          });
        });
      });
    }

    /* multi select ends */

    const selects = block.querySelectorAll('select');
    selects.forEach((select) => {
      if (!select.value) {
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select';
        defaultOption.disabled = true;
        defaultOption.selected = true;
        select.prepend(defaultOption);
      }
    });

    /* dob-calc */
    const datePickers = block.querySelectorAll('.dob-calc input');

    function calculateMinDate() {
      const today = new Date();
      const minDate = new Date(today.setFullYear(today.getFullYear() - 12));
      return minDate.toISOString().split('T')[0];
    }

    const minDate = calculateMinDate();

    // Initialize min and max for each date picker and set the default value to today's date
    datePickers.forEach((datePicker) => {
      const today = new Date();
      const todayFormatted = today.toISOString().split('T')[0];

      // Set min/max attributes and default value
      datePicker.setAttribute('max', todayFormatted);

      datePicker.addEventListener('change', function () {
        const inputDate = new Date(datePicker.value);

        const enteredYear = inputDate.getFullYear();
        const enteredMonth = inputDate.getMonth();
        const enteredDay = inputDate.getDate();

        const today = new Date();
        const todayYear = today.getFullYear();
        const todayMonth = today.getMonth();
        const todayDay = today.getDate();

        const minYear = parseInt(datePicker.getAttribute('min').split('-')[0]);
        const maxYear = parseInt(datePicker.getAttribute('max').split('-')[0]);

        if (!datePicker.value) {
          datePicker.setCustomValidity('');
          return;
        }

        if (enteredYear < minYear || enteredYear > maxYear) {
          datePicker.setCustomValidity(
            `Enter a number between ${minYear} and ${maxYear}.`,
          );
          return;
        }

        if (
          enteredYear > todayYear - 12 ||
          (enteredYear === todayYear - 12 &&
            (enteredMonth > todayMonth ||
              (enteredMonth === todayMonth && enteredDay > todayDay)))
        ) {
          datePicker.setCustomValidity('You must be at least 12 years old.');
          return;
        }

        datePicker.setCustomValidity('');
      });

      datePicker.form.addEventListener('submit', function (event) {
        const value = datePicker.value;
        const inputDate = new Date(value);
        const enteredYear = inputDate.getFullYear();

        const minYear = parseInt(datePicker.getAttribute('min').split('-')[0]);
        const maxYear = parseInt(datePicker.getAttribute('max').split('-')[0]);

        if (datePicker.hasAttribute('required') && !value) {
          datePicker.setCustomValidity(
            `This field is required. Enter a number between ${minYear} and ${maxYear}.`,
          );
        } else if (inputDate > minDate) {
          datePicker.setCustomValidity('You must be at least 12 years old.');
        } else if (enteredYear < minYear || enteredYear > maxYear) {
          datePicker.setCustomValidity(
            `Enter a number between ${minYear} and ${maxYear}.`,
          );
        }

        if (datePicker.validity.customError) {
          event.preventDefault();
        }
      });
    });

    /*dob-calc ends */

    /* Estimated date of ownership */
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const formattedTomorrow = tomorrow.toISOString().split('T')[0];

    const dateInput = block.querySelector('.date-ownership input');

    if (dateInput) {
      dateInput.removeAttribute('readonly');
      dateInput.removeAttribute('disabled');

      dateInput.setAttribute('min', formattedTomorrow);

      dateInput.addEventListener('keydown', (e) => e.preventDefault());
      dateInput.addEventListener('paste', (e) => e.preventDefault());
      dateInput.addEventListener('click', function () {
        if (typeof dateInput.showPicker === 'function') {
          dateInput.showPicker();
        } else {
          dateInput.focus();
        }
      });
    }

    /* Estimated date of ownership ends  */

    /*length starts */
    const radioButtons = document.querySelectorAll(
      '.length-units input[type="radio"]',
    );
    if (radioButtons) {
      const parentContainer = document.querySelector('.length-units');
      if (parentContainer) {
        const lengthInput = parentContainer.querySelector('input');

        // Check if lengthInput exists before adding event listener
        if (lengthInput) {
          lengthInput.addEventListener('keydown', function (e) {
            const allowedKeys = [
              'Backspace',
              'ArrowLeft',
              'ArrowRight',
              'Tab',
              'Delete',
            ];

            // Allow numbers and control keys
            if (
              allowedKeys.includes(e.key) ||
              /^[0-9]$/.test(e.key) || // Allow numbers 0-9
              (e.key === '.' && !lengthInput.value.includes('.')) // Allow decimal point only if one doesn't already exist
            ) {
              return;
            }

            // Prevent any other key presses
            e.preventDefault();
          });

          lengthInput.addEventListener('input', function () {
            // Ensure no more than two decimal places
            if (
              lengthInput.value.includes('.') &&
              lengthInput.value.split('.')[1].length > 2
            ) {
              lengthInput.value = lengthInput.value.slice(
                0,
                lengthInput.value.indexOf('.') + 3,
              );
            }
          });
        }

        const unitSpan = document.createElement('span');
        unitSpan.id = 'unitLabel';

        function updateUnitLabel() {
          const checkedRadio = Array.from(radioButtons).find(
            (radio) => radio.checked,
          );
          if (checkedRadio) {
            const selectedUnit = checkedRadio.value;
            let existingUnitSpan = parentContainer.querySelector('#unitLabel');
            if (existingUnitSpan) {
              existingUnitSpan.remove();
            }

            if (selectedUnit === 'feet') {
              unitSpan.textContent = 'ft';
            } else {
              unitSpan.textContent = 'm';
            }

            // Ensure lengthInput exists before appending
            if (lengthInput) {
              lengthInput.parentElement.appendChild(unitSpan);
            }
          }
        }

        updateUnitLabel();

        radioButtons.forEach((radio) => {
          radio.addEventListener('change', function () {
            updateUnitLabel();
          });
        });
      }
    }

    /*length ends */

    /* data visible */
    // let originalRequiredStates = [];

    // function handleNextButtonClick() {
    //   const fieldsets = document.querySelectorAll(
    //     '.field-whatexcess fieldset.radio-group-wrapper[data-visible="false"]',
    //   );
    //   fieldsets.forEach(function (fieldset) {
    //     const inputs = fieldset.querySelectorAll('input:required');
    //     inputs.forEach(function (input) {
    //       originalRequiredStates.push({
    //         input: input,
    //         required: input.hasAttribute('required'), // Store whether it's required or not
    //       });
    //       input.removeAttribute('required');
    //     });
    //     fieldset.removeAttribute('data-required');
    //   });
    // }

    // function handleBackButtonClick() {
    //   originalRequiredStates.forEach(function (state) {
    //     if (state.required) {
    //       state.input.setAttribute('required', 'required');
    //     } else {
    //       state.input.removeAttribute('required');
    //     }
    //   });

    //   originalRequiredStates = []; // Reset the stored states
    // }

    // // Get the Next and Previous buttons
    // const nextButton = block.querySelector('.wizard-button-next');
    // const prevButton = block.querySelector('.wizard-button-prev');

    // // Ensure buttons exist before attaching event listeners
    // if (nextButton) {
    //   nextButton.addEventListener('click', handleNextButtonClick);
    // }

    // if (prevButton) {
    //   prevButton.addEventListener('click', handleBackButtonClick);
    // }
    /* data visible ends */
    function updateLastVisibleConnector() {
      const items = Array.from(block.querySelectorAll('.wizard-menu-item'));
      let lastVisibleIndex = -1;

      items.forEach((item, i) => {
        const isVisible = item.offsetParent !== null;
        if (isVisible) lastVisibleIndex = i;
      });

      items.forEach((item, i) => {
        item.classList.toggle('no-connector', i === lastVisibleIndex);
      });

      items.forEach((item) => item.classList.remove('completed'));

      const activeIndex = items.findIndex((item) =>
        item.classList.contains('wizard-menu-active-item'),
      );
      if (activeIndex > 0) {
        items.slice(0, activeIndex).forEach((item) => {
          item.classList.add('completed');
        });
      }
    }
    function safeUpdate() {
      observer.disconnect();
      updateLastVisibleConnector();
      observer.observe(block, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'data-visible'],
      });
    }

    const observer = new MutationObserver((mutations) => {
      let shouldUpdate = false;

      mutations.forEach((mutation) => {
        if (
          mutation.type === 'childList' ||
          (mutation.type === 'attributes' && mutation.attributeName === 'class')
        ) {
          shouldUpdate = true;
        }
      });

      if (shouldUpdate) {
        requestAnimationFrame(safeUpdate);
      }
    });

    observer.observe(block, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-visible', 'class'],
    });
    /* manufacture starts */
    const inputField = block.querySelector('.manufacture-year input');

    if (inputField) {
      // Function to validate the year on change
      function validateYearOnChange() {
        const inputValue = inputField.value.trim(); // Trim any leading/trailing spaces
        const currentYear = new Date().getFullYear();
        const maxYear = currentYear + 2;
        const inputYear = parseInt(inputValue, 10);

        // Clear previous custom validity message
        inputField.setCustomValidity(''); // Reset custom validity
        inputField.setAttribute('maxlength', '4');

        // Validate if the input is empty
        if (inputValue === '') {
          inputField.setCustomValidity('Please enter a year.');
        }
        // Validate if the input is a valid number
        else if (!/^\d+$/.test(inputValue)) {
          inputField.setCustomValidity(
            'Please enter a valid year (numbers only).',
          );
        }
        // Validate if the year is within the allowed range
        else if (inputYear < 1900 || inputYear > maxYear) {
          inputField.setCustomValidity(
            `Invalid year. Please enter a year between 1900 and ${maxYear}.`,
          );
        }

        // Trigger the validation check
        inputField.checkValidity();
      }

      // Prevent non-numeric keys from being typed in the input field
      inputField.addEventListener('keydown', function (e) {
        const allowedKeys = [
          'Backspace',
          'ArrowLeft',
          'ArrowRight',
          'Tab',
          'Delete',
        ];

        // If the key pressed is not a number or an allowed key, prevent the key press
        if (!/\d/.test(e.key) && !allowedKeys.includes(e.key)) {
          e.preventDefault();
        }
      });

      // Validate the year on each input change
      inputField.addEventListener('input', validateYearOnChange);

      // Revalidate when the input field loses focus (blur event)
      inputField.addEventListener('blur', function () {
        inputField.checkValidity(); // Explicitly trigger revalidation
      });

      // Optional: You can also listen for invalid events (in case the user tries to submit the form without fixing the input)
      inputField.addEventListener('invalid', function () {});
    }

    // Function to format the number based on selected display format
    function formatNumber(value, format) {
      let number = parseFloat(value);
      if (isNaN(number)) return ''; // Return empty string if the value is not a valid number

      const options = {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      };

      if (format === '¤#,##0.00') {
        return new Intl.NumberFormat('en-US', options).format(number);
      } else if (format === '()¤####0.00') {
        // Example: custom formatting logic for parentheses
        return `(${new Intl.NumberFormat('en-US', options).format(number)})`;
      } else if (format === '#,###,##0.000') {
        return new Intl.NumberFormat('en-US', {
          minimumFractionDigits: 3,
          maximumFractionDigits: 3,
        }).format(number);
      } else if (format === '#,###,##0%') {
        return new Intl.NumberFormat('en-US', {
          style: 'percent',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(number);
      }
      return number.toString(); // Default case if no format is selected
    }

    // When user selects a format, apply it to the displayed value
    block
      .querySelector('.price-total .number-wrapper input')
      .addEventListener('change', function () {
        const rawValue = block.querySelector(
          '.price-total .number-wrapper input',
        ).value;
        const format = this.value;
        const formattedValue = formatNumber(rawValue, format);
        document.querySelector('.price-total .number-wrapper input').value =
          formattedValue;
      });

    // On form submission, send the raw value (without any formatting)
    block
      .querySelector('.submit-wrapper button')
      .addEventListener('click', function (event) {
        event.preventDefault(); // Prevent default form submission

        // Get the formatted value from the input field
        const formattedValue = block.querySelector(
          '.price-total .number-wrapper input',
        ).value;

        // Extract the raw numeric value by removing all non-numeric characters (except for the decimal and minus sign)
        let numericValue = parseFloat(formattedValue.replace(/[^0-9.-]+/g, ''));

        if (isNaN(numericValue)) {
          alert('Invalid input value');
          return;
        }

        // Set the raw numeric value to the price-total (wherever this is displayed, e.g., for submission or other processing)
        // You could set this value in a hidden field or directly use it in your submission:
        document
          .querySelector('.price-total')
          .setAttribute('data-raw-value', numericValue);

        // Now, submit the numeric value (you can log it, send it to the server, etc.)
        console.log('Submitting raw value:', numericValue);
      });
  }, 1000);
  let container = block.querySelector('a[href]');
  let formDef;
  let pathname;
  if (container) {
    ({ pathname } = new URL(container.href));
    formDef = await fetchForm(container.href);
  } else {
    ({ container, formDef } = extractFormDefinition(block));
  }
  let source = 'aem';
  let rules = true;
  let form;
  if (formDef) {
    formDef.action = getSubmitBaseUrl() + (formDef.action || '');
    if (isDocumentBasedForm(formDef)) {
      const transform = new DocBasedFormToAF();
      formDef = transform.transform(formDef);
      source = 'sheet';
      form = await createForm(formDef);
      const docRuleEngine = await import('./rules-doc/index.js');
      docRuleEngine.default(formDef, form);
      rules = false;
    } else {
      afModule = await import('./rules/index.js');
      if (
        afModule &&
        afModule.initAdaptiveForm &&
        !block.classList.contains('edit-mode')
      ) {
        form = await afModule.initAdaptiveForm(formDef, createForm);
      } else {
        form = await createFormForAuthoring(formDef);
      }
    }
    form.dataset.redirectUrl = formDef.redirectUrl || '';
    form.dataset.thankYouMsg = formDef.thankYouMsg || '';
    form.dataset.action = formDef.action || pathname?.split('.json')[0];
    form.dataset.source = source;
    form.dataset.rules = rules;
    form.dataset.id = formDef.id;
    if (source === 'aem' && formDef.properties) {
      form.dataset.formpath = formDef.properties['fd:path'];
    }
    container.replaceWith(form);
  }
}
