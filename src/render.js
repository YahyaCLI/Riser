const {ipcRenderer} = require('electron');
const Fuse = require('fuse.js');

window.addEventListener('DOMContentLoaded', () => {

  const input = document.getElementById('input');
  const results = document.querySelector('.results');

  let list = ['Apple', 'Banana', 'Orange', 'Grapes', 'Pineapple', 'Mango','Extra', 'Extra', 'Extra', 'Extra', 'Extra', 'Extra'];


  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      const query = input.value;
      console.log('Search query:', query);
    }
  });

function renderResults(items) {
  results.innerHTML = '';
  for (const item of items) {
    const div = document.createElement('div');
    div.classList.add('row');
    div.textContent = item;
    results.appendChild(div);
  }
  // Dynamically resize window to fit content

}
renderResults(list);


 // STAY CLEAR, DOMContentLoader final line 
});