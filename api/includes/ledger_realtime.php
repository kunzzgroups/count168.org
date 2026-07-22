<?php
/**
 * Transaction ledger realtime: publish ledger_changed after APPROVED writes.
 * Transport: HTTP POST to local Node SSE hub (services/tx-realtime).
 * Never throws to callers — submit/approve must not fail because of realtime.
 */

if (!function_exists('tx_ledger_realtime_config')) {
    /**
     * @return array{enabled: bool, publish_url: string, secret: string}
     */
    function tx_ledger_realtime_config(): array
    {
        global $tx_realtime_publish_url, $tx_realtime_secret, $tx_realtime_enabled;

        $secret = trim((string) ($tx_realtime_secret ?? ''));
        $url = trim((string) ($tx_realtime_publish_url ?? 'http://127.0.0.1:3911/publish'));
        $explicit = $tx_realtime_enabled ?? null;
        $enabled = $explicit === null ? ($secret !== '' && $url !== '') : (bool) $explicit;

        return [
            'enabled' => $enabled && $secret !== '' && $url !== '',
            'publish_url' => $url,
            'secret' => $secret,
        ];
    }
}

if (!function_exists('tx_ledger_realtime_channels_from_scope')) {
    /**
     * @param array{mode?: string, company_id?: int, group_scope_id?: int} $listScope
     * @return string[]
     */
    function tx_ledger_realtime_channels_from_scope(array $listScope): array
    {
        $channels = [];
        if (($listScope['mode'] ?? '') === 'group') {
            $gid = (int) ($listScope['group_scope_id'] ?? 0);
            if ($gid > 0) {
                $channels[] = 'tx:g:' . $gid;
            }
        }
        $cid = (int) ($listScope['company_id'] ?? 0);
        if ($cid > 0) {
            $channels[] = 'tx:c:' . $cid;
        }

        return array_values(array_unique($channels));
    }
}

if (!function_exists('tx_ledger_realtime_sign_ticket')) {
    /**
     * @param array<string, mixed> $payload
     */
    function tx_ledger_realtime_sign_ticket(array $payload, string $secret): string
    {
        $body = rtrim(strtr(base64_encode(json_encode($payload, JSON_UNESCAPED_UNICODE)), '+/', '-_'), '=');
        $sig = rtrim(strtr(base64_encode(hash_hmac('sha256', $body, $secret, true)), '+/', '-_'), '=');

        return $body . '.' . $sig;
    }
}

if (!function_exists('tx_ledger_realtime_publish')) {
    /**
     * @param string[] $channels
     * @param array<string, mixed> $extra
     */
    function tx_ledger_realtime_publish(array $channels, string $source = 'unknown', array $extra = []): void
    {
        $channels = array_values(array_filter(array_map(static function ($c) {
            return trim((string) $c);
        }, $channels)));
        if ($channels === []) {
            return;
        }

        $cfg = tx_ledger_realtime_config();
        if (!$cfg['enabled']) {
            return;
        }

        $payload = array_merge([
            'type' => 'ledger_changed',
            'source' => $source,
            'channels' => $channels,
            'rev' => (string) (int) round(microtime(true) * 1000),
            'ts' => time(),
        ], $extra);

        $body = json_encode($payload, JSON_UNESCAPED_UNICODE);
        if ($body === false) {
            return;
        }

        $url = $cfg['publish_url'];
        $secret = $cfg['secret'];

        try {
            if (function_exists('curl_init')) {
                $ch = curl_init($url);
                if ($ch === false) {
                    return;
                }
                curl_setopt_array($ch, [
                    CURLOPT_POST => true,
                    CURLOPT_HTTPHEADER => [
                        'Content-Type: application/json',
                        'X-Realtime-Secret: ' . $secret,
                    ],
                    CURLOPT_POSTFIELDS => $body,
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_CONNECTTIMEOUT_MS => 400,
                    CURLOPT_TIMEOUT_MS => 800,
                ]);
                curl_exec($ch);
                curl_close($ch);
                return;
            }

            $context = stream_context_create([
                'http' => [
                    'method' => 'POST',
                    'header' => "Content-Type: application/json\r\nX-Realtime-Secret: {$secret}\r\n",
                    'content' => $body,
                    'timeout' => 1,
                    'ignore_errors' => true,
                ],
            ]);
            @file_get_contents($url, false, $context);
        } catch (Throwable $e) {
            error_log('tx_ledger_realtime_publish: ' . $e->getMessage());
        }
    }
}

if (!function_exists('tx_ledger_realtime_publish_scope')) {
    /**
     * @param array{mode?: string, company_id?: int, group_scope_id?: int} $listScope
     */
    function tx_ledger_realtime_publish_scope(array $listScope, string $source = 'unknown', array $extra = []): void
    {
        tx_ledger_realtime_publish(
            tx_ledger_realtime_channels_from_scope($listScope),
            $source,
            $extra
        );
    }
}
