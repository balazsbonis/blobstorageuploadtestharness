using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;

namespace TestHarness
{
    public interface IBlobStorage
    {
        Task<string> GetSasUriForUpload(string containerName, string blobName, DateTimeOffset? expiration);
    }
}
