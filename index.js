// @ts-check
function bskye() {

  function loading() {
    var middle = document.createElement('div');
    middle.style.cssText = 'position: absolute; top:0;left:0;width:100%;height:100%; display: grid; grid-template-row: 1fr; grid-template-column: 1fr; align-items: center; justify-items: center;';
    document.body.appendChild(middle);
    var central = document.createElement('div');
    central.textContent = 'Loading...';
    middle.appendChild(central);
  }

  loading();
}