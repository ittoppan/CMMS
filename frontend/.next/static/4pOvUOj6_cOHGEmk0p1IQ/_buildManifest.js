self.__BUILD_MANIFEST = {
  "__rewrites": {
    "afterFiles": [
      {
        "source": "/api/:path*"
      },
      {
        "source": "/line_callback.php"
      },
      {
        "source": "/line_login.php"
      },
      {
        "source": "/bind_line.php"
      },
      {
        "source": "/login.php"
      },
      {
        "source": "/logout.php"
      },
      {
        "source": "/uploads/:path*"
      }
    ],
    "beforeFiles": [],
    "fallback": []
  },
  "sortedPages": [
    "/_app",
    "/_error"
  ]
};self.__BUILD_MANIFEST_CB && self.__BUILD_MANIFEST_CB()