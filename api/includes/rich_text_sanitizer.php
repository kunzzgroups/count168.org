<?php
/**
 * Shared sanitizer for announcement/maintenance rich text content.
 */

function richTextAllowedTags(): array
{
    return [
        'p', 'br',
        'strong', 'b', 'em', 'i', 'u', 's',
        'ul', 'ol', 'li',
        'blockquote',
        'pre', 'code',
        'a',
        'h1', 'h2', 'h3', 'h4',
    ];
}

function richTextDropWithChildrenTags(): array
{
    return ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta'];
}

function sanitizeRichTextHref(string $href): string
{
    $raw = trim($href);
    if ($raw === '') {
        return '';
    }
    if ($raw[0] === '#' || $raw[0] === '/') {
        return $raw;
    }
    if (preg_match('/^(https?:|mailto:|tel:)/i', $raw) === 1) {
        return $raw;
    }
    return '';
}

function sanitizeRichTextNode(DOMNode $node, DOMDocument $outputDoc): ?DOMNode
{
    if ($node->nodeType === XML_TEXT_NODE) {
        return $outputDoc->createTextNode($node->textContent ?? '');
    }

    if ($node->nodeType !== XML_ELEMENT_NODE) {
        return null;
    }

    $tag = strtolower($node->nodeName);
    $allowedTags = richTextAllowedTags();
    $dropTags = richTextDropWithChildrenTags();

    if (in_array($tag, $dropTags, true)) {
        return null;
    }

    if (!in_array($tag, $allowedTags, true)) {
        $fragment = $outputDoc->createDocumentFragment();
        foreach ($node->childNodes as $childNode) {
            $safeChild = sanitizeRichTextNode($childNode, $outputDoc);
            if ($safeChild !== null) {
                $fragment->appendChild($safeChild);
            }
        }
        return $fragment;
    }

    $safeNode = $outputDoc->createElement($tag);
    if ($tag === 'a' && $node instanceof DOMElement) {
        $safeHref = sanitizeRichTextHref((string) $node->getAttribute('href'));
        if ($safeHref !== '') {
            $safeNode->setAttribute('href', $safeHref);
            if (stripos($safeHref, 'http://') === 0 || stripos($safeHref, 'https://') === 0) {
                $safeNode->setAttribute('target', '_blank');
                $safeNode->setAttribute('rel', 'noopener noreferrer');
            }
        }
    }

    foreach ($node->childNodes as $childNode) {
        $safeChild = sanitizeRichTextNode($childNode, $outputDoc);
        if ($safeChild !== null) {
            $safeNode->appendChild($safeChild);
        }
    }

    return $safeNode;
}

function sanitizeRichTextHtml(string $html): string
{
    $raw = trim($html);
    if ($raw === '') {
        return '';
    }

    if (!class_exists('DOMDocument')) {
        $allowed = '<p><br><strong><b><em><i><u><s><ul><ol><li><blockquote><pre><code><a><h1><h2><h3><h4>';
        return trim(strip_tags($raw, $allowed));
    }

    $internalErrors = libxml_use_internal_errors(true);
    $sourceDoc = new DOMDocument('1.0', 'UTF-8');
    $sourceDoc->loadHTML(
        '<?xml encoding="utf-8" ?><div id="__rich_root__">' . $raw . '</div>',
        LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD
    );

    $inputRoot = $sourceDoc->getElementById('__rich_root__');
    if (!$inputRoot instanceof DOMElement) {
        libxml_clear_errors();
        libxml_use_internal_errors($internalErrors);
        return '';
    }

    $outputDoc = new DOMDocument('1.0', 'UTF-8');
    $outputRoot = $outputDoc->createElement('div');
    $outputDoc->appendChild($outputRoot);

    foreach ($inputRoot->childNodes as $childNode) {
        $safeNode = sanitizeRichTextNode($childNode, $outputDoc);
        if ($safeNode !== null) {
            $outputRoot->appendChild($safeNode);
        }
    }

    $safeHtml = '';
    foreach ($outputRoot->childNodes as $childNode) {
        $safeHtml .= $outputDoc->saveHTML($childNode);
    }

    libxml_clear_errors();
    libxml_use_internal_errors($internalErrors);
    return trim((string) $safeHtml);
}

function richTextHtmlToPlainText(string $html): string
{
    $normalized = preg_replace('/<\s*br\s*\/?>/i', "\n", $html);
    $normalized = preg_replace('/<\/(p|div|li|blockquote|h[1-6]|pre)>/i', "\n", (string) $normalized);
    $plain = strip_tags((string) $normalized);
    $plain = html_entity_decode($plain, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $plain = preg_replace("/\r\n?/", "\n", $plain);
    $plain = preg_replace("/\n{3,}/", "\n\n", $plain);
    return trim((string) $plain);
}
