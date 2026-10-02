package com.besttodo.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.File;
import org.junit.Test;

public class AssetPathsTest {
    @Test
    public void onlyTheAppOriginIsServedLocally() {
        assertTrue(AssetPaths.isAppOrigin("https", "todo.local"));
        assertFalse(AssetPaths.isAppOrigin("http", "todo.local"));
        assertFalse(AssetPaths.isAppOrigin("https", "api.example.com"));
    }

    @Test
    public void pathsStayInsidePublicAssets() {
        assertEquals("public/index.html", AssetPaths.resolve(null));
        assertEquals("public/index.html", AssetPaths.resolve("/"));
        assertEquals("public/app.js", AssetPaths.resolve("/app.js"));
        assertNull(AssetPaths.resolve("/../secret.txt"));
        assertNull(AssetPaths.resolve("/a\\..\\b"));
    }

    @Test
    public void moduleScriptsGetJavaScriptMimeType() {
        assertEquals("text/javascript", AssetPaths.knownMimeType("public/app.js"));
        assertEquals("text/css", AssetPaths.knownMimeType("public/STYLE.CSS"));
        assertNull(AssetPaths.knownMimeType("public/icon.png"));
    }

    @Test
    public void sharedFrontendIsBundled() {
        // preBuild で ../public がコピーされていること（index.html が参照するファイルも含む）
        for (String name : new String[] {"index.html", "app.js", "style.css"}) {
            assertTrue(name, new File("src/main/assets/public/" + name).isFile());
        }
    }
}
