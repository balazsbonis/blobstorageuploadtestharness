using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Formatting;
using System.Threading.Tasks;
using System.Web.Http;
using Microsoft.AspNetCore.Mvc;

namespace TestHarness.Controllers
{
    public class HomeController : Controller
    {
        private IBlobStorage _blobStorage;
        public HomeController()
        {
            _blobStorage = new AzureBlobStorage();
        }
        public IActionResult Index()
        {
            return View();
        }
        
        public IActionResult Error()
        {
            return View();
        }

        public async Task<string> GetById([FromUri] string id)
        {
            var sasUri = await _blobStorage.GetSasUriForUpload("testcontainer", id, null);
            return sasUri;
        }
    }
}
