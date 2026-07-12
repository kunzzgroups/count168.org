# C168 Mobile SPA — include inside count168.site server { } (HTTP or le-ssl)
location ^~ /c168_mobile/frontend/dist/assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
    access_log off;
    try_files $uri =404;
}

location = /c168_mobile/frontend/dist/index.html {
    add_header Cache-Control "no-cache";
    try_files $uri =404;
}

location = /c168_mobile {
    return 302 /c168_mobile/login;
}

location ~ "^/c168_mobile/(login|dashboard|home|member|report|transaction|more|reset-password|owner-secondary-password|user-secondary-password)(/.*)?$" {
    add_header Cache-Control "no-cache";
    try_files /c168_mobile/frontend/dist/index.html =404;
}
