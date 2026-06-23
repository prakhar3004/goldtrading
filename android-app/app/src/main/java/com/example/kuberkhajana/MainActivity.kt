package com.example.kuberkhajana

import android.app.Activity
import android.os.Bundle
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient

class MainActivity : Activity() {
  private lateinit var webView: WebView

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    webView = WebView(this).apply {
      settings.javaScriptEnabled = true
      settings.domStorageEnabled = true
      settings.useWideViewPort = true
      settings.loadWithOverviewMode = true
      settings.cacheMode = WebSettings.LOAD_DEFAULT
      
      webViewClient = object : WebViewClient() {
        @Deprecated("Deprecated in Java")
        override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
          if (url != null) {
            view?.loadUrl(url)
          }
          return true
        }
      }
      
      loadUrl("https://kuberkhajana.vercel.app")
    }

    setContentView(webView)
  }

  @Deprecated("Deprecated in Java")
  override fun onBackPressed() {
    if (::webView.isInitialized && webView.canGoBack()) {
      webView.goBack()
    } else {
      super.onBackPressed()
    }
  }
}

