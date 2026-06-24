export const cursor = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
window.addEventListener('mousemove', e => { cursor.x = e.clientX; cursor.y = e.clientY })