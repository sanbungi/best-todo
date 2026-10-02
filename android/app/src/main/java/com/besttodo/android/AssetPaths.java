package com.besttodo.android;

import java.util.Locale;

/** アプリ内オリジンへのリクエストを assets/public 内のファイルへ対応付ける。 */
final class AssetPaths {
    static final String APP_ORIGIN = "https://todo.local";

    private AssetPaths() {}

    static boolean isAppOrigin(String scheme, String host) {
        return APP_ORIGIN.equals(scheme + "://" + host);
    }

    /** assets 内のパスを返す。public の外を指すパスは null。 */
    static String resolve(String path) {
        if (path == null || path.equals("/")) path = "/index.html";
        if (!path.startsWith("/") || path.contains("..") || path.contains("\\")) return null;
        return "public" + path;
    }

    /** WebView が module script として扱えるよう主要な型は明示する。他は null。 */
    static String knownMimeType(String assetPath) {
        int dot = assetPath.lastIndexOf('.');
        String extension = dot < 0 ? "" : assetPath.substring(dot + 1).toLowerCase(Locale.ROOT);
        switch (extension) {
            case "js":
            case "mjs":
                return "text/javascript";
            case "css":
                return "text/css";
            case "html":
                return "text/html";
            default:
                return null;
        }
    }
}
