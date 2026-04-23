<?php
/**
 * Quick entry to the React SPA (deploy output lives under /app/).
 * Legacy HTML login remains at index.php.
 */
header('Location: /app/', true, 302);
exit;
