#include "cifxlinux.h"
#include "cifXEndianess.h"

#include "rcX_Public.h"

#include <errno.h>
#include <fcntl.h>
#include <string.h>
#include <stdio.h>
#include <stdlib.h>
#include <termios.h>
#include <unistd.h>
#include <sys/mman.h>
#include <time.h>
#include <signal.h>

#define CIFX_DEV "cifX0"

#ifndef UNREFERENCED_PARAMETER
  #define UNREFERENCED_PARAMETER(a) (a=a)
#endif

typedef enum { false, true } bool;

/* File handling variables */
bool fLoadFirmware;
uint32_t ulSize;
void* pvBuffer;
FILE* hFile = NULL;
char *chFilename = NULL;
char *chFile = NULL;

CIFXHANDLE hDriver = NULL;
CIFXHANDLE hSysdevice = NULL;
SYSTEM_CHANNEL_SYSTEM_INFO_BLOCK tSystemInfoBlock;
CIFX_DIRECTORYENTRY tDirectoryEntry;



/*****************************************************************************************/
/*! Function that evaluates the netX device number. Echoes "netHAT" or "netPI" or "unknown"
*   \return CIFX_NO_ERROR on success                                                     */
/*****************************************************************************************/
int32_t SysDevice()
{

  int32_t    lRet    = xDriverOpen(&hDriver);


  if(CIFX_NO_ERROR == lRet)
  {
    /* Driver successfully opened, SPI and netX found */

    lRet = xSysdeviceOpen(hDriver, CIFX_DEV ,&hSysdevice);

    if(CIFX_NO_ERROR != lRet)
    {
      printf("Error opening System-Channel!");

    } else {

	/* Query System Information Block */
	if( CIFX_NO_ERROR != (lRet = xSysdeviceInfo(hSysdevice, CIFX_INFO_CMD_SYSTEM_INFO_BLOCK, sizeof(SYSTEM_CHANNEL_SYSTEM_INFO_BLOCK), &tSystemInfoBlock )))
      	{
        	printf("Error querying system information block\r\n"); 
        } else {

        	if( (long unsigned int)tSystemInfoBlock.ulDeviceNumber / 100 == 77750) {
			printf("netHAT");

                } else if( (long unsigned int)tSystemInfoBlock.ulDeviceNumber / 100 == 76601) {
                        printf("netPI");
                } else {
			printf("unknown");
                }
        }

	xSysdeviceClose(hSysdevice);

    }

    xDriverClose(hDriver);
  }
  return lRet;
};

/*****************************************************************************/
/*! Main entry function
*   \return 0                                                                */
/*****************************************************************************/
int main(int argc, char* argv[])
{
  struct CIFX_LINUX_INIT init =
  {
    .init_options        = CIFX_DRIVER_INIT_AUTOSCAN,
    .iCardNumber         = 0,
    .fEnableCardLocking  = 0,
    .base_dir            = NULL,
    .poll_interval       = 0,
    .poll_StackSize      = 0,   /* set to 0 to use default */
    .trace_level         = 255,
    .user_card_cnt       = 0,
    .user_cards          = NULL,
  };
	
  /* First of all initialize driver */
  int32_t lRet = cifXDriverInit(&init);

  if(CIFX_NO_ERROR == lRet) {
  
 	/* Gather System Information */
    	SysDevice();
  }

  cifXDriverDeinit();

  return 0;
}
