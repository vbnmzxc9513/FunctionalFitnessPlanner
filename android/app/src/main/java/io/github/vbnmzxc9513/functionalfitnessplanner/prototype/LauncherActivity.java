/*
 * Copyright 2020 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package io.github.vbnmzxc9513.functionalfitnessplanner.prototype;

import android.content.pm.ActivityInfo;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Setting an orientation crashes the app due to the transparent background on Android 8.0
        // Oreo and below. We only set the orientation on Oreo and above. This only affects the
        // splash screen and Chrome will still respect the orientation.
        // See https://github.com/GoogleChromeLabs/bubblewrap/issues/496 for details.
        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }
    }

    /** Keep the original encoded path, query and fragment for cold and warm VIEW launches. */
    @Override
    protected Uri getUrlForIntent(Intent intent) {
        Uri uri = intent.getData();
        Uri configuredOrigin = Uri.parse(getString(R.string.launchUrl));
        if (Intent.ACTION_VIEW.equals(intent.getAction()) && uri != null
                && "https".equalsIgnoreCase(uri.getScheme())
                && configuredOrigin.getHost().equalsIgnoreCase(uri.getHost())
                && (uri.getPort() == -1 || uri.getPort() == 443)
                && uri.getUserInfo() == null) {
            return uri;
        }
        return null;
    }

    // Standard launch mode normally creates a fresh launcher for warm links. Also handle
    // an explicit SINGLE_TOP Intent without silently retaining the previous share URL.
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        launchTwa();
    }
}
