const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

canvas.width = 800;
canvas.height = 600;

// ==== CARGA DE IMÁGENES ====
const groundSoftImg = new Image();
groundSoftImg.src = 'assets/tiles/tile_ground_soft.png';

const fogImg = new Image();
fogImg.src = 'assets/tiles/tile_fog.png';

const middleOkImg = new Image();
middleOkImg.src = 'assets/tiles/tile_middleok.png';

// Ejemplo de otras imágenes que ya tenías
const playerImg = new Image();
playerImg.src = 'assets/player.png';

const backgroundImg = new Image();
backgroundImg.src = 'assets/background.png';

// ==== VARIABLES DEL JUEGO ====
let playerX = 50;
let playerY = 300;
let speed = 2;

// ==== LOOP PRINCIPAL ====
function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Dibuja fondo
    ctx.drawImage(backgroundImg, 0, 0, canvas.width, canvas.height);

    // Ejemplo: dibujar tiles nuevos
    ctx.drawImage(groundSoftImg, 100, 500);
    ctx.drawImage(fogImg, 200, 450);
    ctx.drawImage(middleOkImg, 300, 480);

    // Dibuja jugador
    ctx.drawImage(playerImg, playerX, playerY);

    playerX += speed;
    if (playerX > canvas.width - 50 || playerX < 0) {
        speed *= -1;
    }

    requestAnimationFrame(gameLoop);
}

// Cuando todo esté cargado
window.onload = () => {
    gameLoop();
};
