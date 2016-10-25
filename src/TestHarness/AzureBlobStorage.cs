using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.WindowsAzure.Storage;
using Microsoft.WindowsAzure.Storage.Blob;
using Microsoft.WindowsAzure.Storage.Shared.Protocol;
using System.Linq;

namespace TestHarness
{
    public class AzureBlobStorage : IBlobStorage
    {
        private readonly CloudBlobClient _client;

        public AzureBlobStorage()
        {
            var account = CloudStorageAccount.Parse("UseDevelopmentStorage=true"); // replace with connection string
            _client = account.CreateCloudBlobClient();
            Task.WaitAll(SetUpCorsRules());
        }

        public async Task<string> GetSasUriForUpload(string containerName, string blobName, DateTimeOffset? expiration)
        {
            try
            {
                var sasConstraints = new SharedAccessBlobPolicy
                {
                    SharedAccessExpiryTime = expiration ?? DateTimeOffset.UtcNow.AddMinutes(15.0),
                    Permissions = SharedAccessBlobPermissions.Write
                };
                var container = await GetContainer(containerName);
                var blob = container.GetBlobReference(blobName);
                return blob.Uri + blob.GetSharedAccessSignature(sasConstraints);
            }
            catch (Exception exception)
            {
                return null;
            }
        }

        private async Task<CloudBlobContainer> GetContainer(string containerName)
        {
            var container = _client.GetContainerReference(containerName);
            await container.CreateIfNotExistsAsync();
            return container;
        }

        private async Task SetUpCorsRules()
        {
            var serviceProperties = await _client.GetServicePropertiesAsync();
            
            serviceProperties.Cors.CorsRules.Clear();

            serviceProperties.Cors.CorsRules.Add(new CorsRule
            {
                AllowedHeaders = new List<string> { "x-ms-blob-type", "x-ms-blob-content-type", "content-type", "accept", "authorization", "origin", "x-requested-with" },
                AllowedMethods = CorsHttpMethods.Put | CorsHttpMethods.Get | CorsHttpMethods.Options,
                // note: this should be changed to the site's URL
                AllowedOrigins = new List<string> { "*" },
                // set to the same length as the SAS token's expiration
                MaxAgeInSeconds = 15*60,
                ExposedHeaders = new List<string> { "*" }
            });
            await _client.SetServicePropertiesAsync(serviceProperties);
        }
    }
}
