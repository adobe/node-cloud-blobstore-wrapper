/*************************************************************************
* ADOBE CONFIDENTIAL
* ___________________
*
* Copyright 2020 Adobe
* All Rights Reserved.
*
* NOTICE: All information contained herein is, and remains
* the property of Adobe and its suppliers, if any. The intellectual
* and technical concepts contained herein are proprietary to Adobe
* and its suppliers and are protected by all applicable intellectual
* property laws, including trade secret and copyright laws.
* Dissemination of this information or reproduction of this material
* is strictly forbidden unless prior written permission is obtained
* from Adobe.
**************************************************************************/

'use strict';

class StringUtils {
    /* Verifies if a string is blank or not
     *
     * @param {String} string to test
     * @return {Boolean} Ltrue if string is empty, false otherwise
     */
    static isBlankString(str){
        if(str === undefined || str === null){
            str = '';
        }
        return (/^\s*$/).test(str);
    }
}


module.export = StringUtils;